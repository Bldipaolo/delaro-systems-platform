"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoDecisions } from "@/lib/decisions/demo";
import { demoDecisionCookie, getDemoDecisionState } from "@/lib/data/decisions";

export type DecisionActionState = { error: string | null; success: string | null };
const initialError = (message: string): DecisionActionState => ({ error: message, success: null });
const responseSchema = z.object({
  decisionId: z.string().min(1),
  response: z.enum(["approved", "changes_requested", "declined"]),
  optionId: z.string().optional(),
  note: z.string().trim().max(2000).optional(),
  confirmation: z.string().trim().optional(),
});

export async function respondToDecision(_previous: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const parsed = responseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialError("Check the response and try again.");
  const { decisionId, response, optionId, note, confirmation } = parsed.data;
  if (response !== "approved" && (!note || note.length < 5)) return initialError("Add a short explanation for your response.");

  if (!isSupabaseConfigured()) {
    const decision = demoDecisions.find((item) => item.id === decisionId);
    if (!decision) return initialError("Decision not found.");
    const existing = (await getDemoDecisionState())[decisionId];
    if (existing?.status && existing.status !== "open") return initialError("This request has already been answered.");
    if (response === "approved" && !decision.options.some((option) => option.id === optionId)) return initialError("Select an option to approve.");
    if (response === "approved" && decision.riskLevel !== "standard" && confirmation !== "APPROVE") return initialError("Type APPROVE to confirm this decision.");
    const state = await getDemoDecisionState();
    state[decisionId] = { ...state[decisionId], status: response, optionId: response === "approved" ? optionId : undefined, note };
    (await cookies()).set(demoDecisionCookie, JSON.stringify(state), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    revalidatePath("/decisions"); revalidatePath("/overview");
    return { error: null, success: "Saved in this demo browser. No live action was taken." };
  }

  if (!z.string().uuid().safeParse(decisionId).success || (optionId && !z.string().uuid().safeParse(optionId).success)) return initialError("Invalid decision selection.");
  const context = await getCurrentUserContext();
  if (!context || context.role === "read_only") return initialError("You do not have permission to respond.");
  const supabase = await createClient();
  if (!supabase) return initialError("The workspace is unavailable.");
  const organizationId = context.organization.id;
  const { data: decision, error: decisionError } = await supabase.from("decisions")
    .select("id,risk_level,status,client_visible").eq("id", decisionId).eq("organization_id", organizationId).eq("client_visible", true).maybeSingle();
  if (decisionError || !decision || !["open", "in_discussion"].includes(decision.status)) return initialError("This decision is no longer open.");
  if (response === "approved") {
    if (!optionId) return initialError("Select an option to approve.");
    const { data: option } = await supabase.from("decision_options").select("id")
      .eq("id", optionId).eq("decision_id", decisionId).eq("organization_id", organizationId).eq("client_visible", true).maybeSingle();
    if (!option) return initialError("Select a published option.");
    if (decision.risk_level !== "standard" && confirmation !== "APPROVE") return initialError("Type APPROVE to confirm this decision.");
    if (decision.risk_level === "high" && !["client_admin", "delaro_admin"].includes(context.role)) return initialError("High-risk approval requires an administrator.");
  }
  const { data: updated, error } = await supabase.from("approvals").update({
    status: response, selected_option_id: response === "approved" ? optionId : null,
    response_note: note || null, confirmation_text: response === "approved" ? confirmation || null : null,
  }).eq("decision_id", decisionId).eq("organization_id", organizationId)
    .eq("requested_from_membership_id", context.membership.id).eq("status", "pending").select("id").maybeSingle();
  if (error) return initialError(error.message);
  if (!updated) return initialError("No pending approval was assigned to your account.");
  revalidatePath("/decisions"); revalidatePath("/overview");
  return { error: null, success: "Your response was recorded." };
}

export async function commentOnDecision(_previous: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const parsed = z.object({ decisionId: z.string().min(1), body: z.string().trim().min(1).max(4000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialError("Write a comment before posting.");
  const { decisionId, body } = parsed.data;
  if (!isSupabaseConfigured()) {
    if (body.length > 240) return initialError("Keep demo comments under 240 characters.");
    if (!demoDecisions.some((item) => item.id === decisionId)) return initialError("Decision not found.");
    const state = await getDemoDecisionState();
    const current = state[decisionId] ?? {};
    state[decisionId] = { ...current, comments: [...(current.comments ?? []).slice(-9), body] };
    (await cookies()).set(demoDecisionCookie, JSON.stringify(state), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    revalidatePath("/decisions");
    return { error: null, success: "Comment saved in this demo browser." };
  }
  if (!z.string().uuid().safeParse(decisionId).success) return initialError("Invalid decision.");
  const context = await getCurrentUserContext();
  if (!context || context.role === "read_only") return initialError("You do not have permission to comment.");
  const supabase = await createClient();
  if (!supabase) return initialError("The workspace is unavailable.");
  const { data: decision } = await supabase.from("decisions").select("id").eq("id", decisionId)
    .eq("organization_id", context.organization.id).eq("client_visible", true).maybeSingle();
  if (!decision) return initialError("Decision not found in this workspace.");
  const { error } = await supabase.from("comments").insert({ organization_id: context.organization.id,
    decision_id: decisionId, author_membership_id: context.membership.id, body, client_visible: true });
  if (error) return initialError(error.message);
  revalidatePath("/decisions");
  return { error: null, success: "Comment added to the decision record." };
}
