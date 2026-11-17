"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = z.union([z.string().uuid(), z.literal("")]);

async function workspace() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  return { context, client, organizationId: context.organization.id };
}

export async function createDecisionRequest(formData: FormData) {
  const input = z.object({
    kind: z.enum(["approval","question","exception","recommendation"]),
    riskLevel: z.enum(["standard","elevated","high"]), requiredApprovalRole: z.enum(["client_user","client_admin"]),
    requestedFromMembershipId: z.string().uuid(), title: z.string().trim().min(3).max(200),
    context: z.string().trim().min(10).max(6000), whyNeeded: z.string().trim().min(10).max(4000),
    recommendation: z.string().trim().max(4000), financialConsequence: z.string().trim().max(2000),
    operationalConsequence: z.string().trim().max(2000), dueDate: z.union([z.string().date(), z.literal("")]),
    processId: optionalUuid, opportunityId: optionalUuid, initiativeId: optionalUuid,
    optionOne: z.string().trim().min(2).max(500), optionTwo: z.string().trim().min(2).max(500),
    recommendedOption: z.enum(["one","two"]), publish: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client, organizationId } = await workspace();
  if (input.kind === "approval" && input.publish !== "on") throw new Error("Approval requests must be published to the assigned client member.");

  const { data: assignee } = await client.from("organization_memberships").select("id,role,status")
    .eq("organization_id", organizationId).eq("id", input.requestedFromMembershipId).maybeSingle();
  if (!assignee || assignee.status !== "active" || !["client_admin","client_user"].includes(assignee.role)) throw new Error("Choose an active client member.");
  if ((input.requiredApprovalRole === "client_admin" || input.riskLevel === "high") && assignee.role !== "client_admin") throw new Error("This request requires a client administrator.");

  for (const [table, id, message] of [
    ["processes", input.processId, "Process"], ["opportunities", input.opportunityId, "Opportunity"], ["initiatives", input.initiativeId, "Improvement"],
  ] as const) if (id) {
    const { data } = await client.from(table).select("id").eq("organization_id", organizationId).eq("id", id).maybeSingle();
    if (!data) throw new Error(`${message} does not belong to this organization.`);
  }

  const { data: decision, error } = await client.from("decisions").insert({
    organization_id: organizationId, process_id: input.processId || null, opportunity_id: input.opportunityId || null,
    initiative_id: input.initiativeId || null, kind: input.kind, risk_level: input.riskLevel,
    required_approval_role: input.requiredApprovalRole, title: input.title, context: input.context,
    why_needed: input.whyNeeded, recommendation: input.recommendation || null,
    financial_consequence: input.financialConsequence || null, operational_consequence: input.operationalConsequence || null,
    requested_from_membership_id: input.requestedFromMembershipId, requested_by_membership_id: context.membership.id,
    due_date: input.dueDate || null, status: "open", client_visible: input.publish === "on",
  }).select("id").single();
  if (error || !decision) { console.error("Decision request failed", { code: error?.code }); throw new Error("Unable to create the decision request."); }

  const options = [input.optionOne, input.optionTwo].filter(Boolean).map((title, index) => ({
    organization_id: organizationId, decision_id: decision.id, title, sort_order: index,
    is_recommended: input.recommendedOption === (index === 0 ? "one" : "two"), client_visible: input.publish === "on",
  }));
  const { error: optionsError } = await client.from("decision_options").insert(options);
  if (optionsError) { await client.from("decisions").delete().eq("organization_id", organizationId).eq("id", decision.id); throw new Error("The decision could not save its options."); }
  if (input.kind === "approval") {
    const { error: approvalError } = await client.from("approvals").insert({ organization_id: organizationId, decision_id: decision.id, requested_from_membership_id: input.requestedFromMembershipId, status: "pending" });
    if (approvalError) { await client.from("decisions").delete().eq("organization_id", organizationId).eq("id", decision.id); throw new Error("The approval assignment could not be created."); }
  }
  revalidatePath("/internal/decisions"); revalidatePath("/decisions"); revalidatePath("/overview");
}

export async function updateDecisionRequest(formData: FormData) {
  const input = z.object({ decisionId: z.string().uuid(), action: z.enum(["publish","cancel"]) }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const values = input.action === "publish" ? { client_visible: true } : { status: "cancelled", client_visible: false };
  const { data, error } = await client.from("decisions").update(values).eq("organization_id", organizationId).eq("id", input.decisionId).select("id").maybeSingle();
  if (error || !data) throw new Error("Unable to update this decision.");
  if (input.action === "publish") {
    const { error: optionError } = await client.from("decision_options").update({ client_visible: true })
      .eq("organization_id", organizationId).eq("decision_id", input.decisionId);
    if (optionError) throw new Error("The decision was published, but its options could not be shared.");
  }
  revalidatePath("/internal/decisions"); revalidatePath("/decisions"); revalidatePath("/overview");
}
