"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireInternalActionContext, requireInternalUserContext } from "@/lib/auth/context";
import { assertOpportunityReference, assertOrganizationMemberReference } from "@/lib/auth/references";

const initiativeInputSchema = z.object({
  organizationId: z.string().uuid(),
  opportunityId: z.string().uuid().nullable(),
  title: z.string().trim().min(3).max(160),
  objective: z.string().trim().min(10).max(4000),
  scope: z.string().trim().max(4000).optional(),
  ownerId: z.string().uuid().nullable(),
  currentPhase: z.enum(["Validation", "Design", "Build", "Test", "Deploy", "Measure"]),
  targetLaunchDate: z.string().date().nullable(),
  clientVisibleSummary: z.string().trim().max(4000).optional(),
});

export async function createInitiative(input: unknown) {
  const parsed = initiativeInputSchema.parse(input);
  const context = await requireInternalActionContext(parsed.organizationId);
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  await Promise.all([
    assertOpportunityReference(supabase, context.organization.id, parsed.opportunityId),
    assertOrganizationMemberReference(supabase, context.organization.id, parsed.ownerId),
  ]);
  const { data, error } = await supabase.from("initiatives").insert({
    organization_id: context.organization.id,
    opportunity_id: parsed.opportunityId,
    title: parsed.title,
    objective: parsed.objective,
    owner_id: parsed.ownerId,
    current_phase: parsed.currentPhase,
    target_launch_date: parsed.targetLaunchDate,
    client_visible_summary: parsed.clientVisibleSummary || null,
  }).select("id").single();
  if (error) { console.error("Initiative creation failed", { code: error.code }); throw new Error("Unable to save the improvement."); }
  if (parsed.scope) {
    const { error: detailsError } = await supabase.from("initiative_internal_details").insert({
      initiative_id: data.id, organization_id: context.organization.id, scope_internal: parsed.scope,
    });
    if (detailsError) { console.error("Private initiative detail save failed", { code: detailsError.code }); throw new Error("Improvement saved, but private scope was not saved. Review the record before publishing."); }
  }
  revalidatePath("/initiatives");
  revalidatePath("/internal/initiatives");
  return { id: data.id };
}

export async function createInitiativeFromForm(formData: FormData) {
  const input = z.object({
    opportunityId: z.union([z.string().uuid(), z.literal("")]),
    title: z.string().trim().min(3).max(160), objective: z.string().trim().min(10).max(4000),
    scope: z.string().trim().max(4000), currentPhase: z.enum(["Validation","Design","Build","Test","Deploy","Measure"]),
    targetLaunchDate: z.union([z.string().date(), z.literal("")]),
    clientVisibleSummary: z.string().trim().max(4000),
  }).parse(Object.fromEntries(formData));
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  await createInitiative({ ...input, organizationId: context.organization.id,
    opportunityId: input.opportunityId || null, ownerId: null,
    targetLaunchDate: input.targetLaunchDate || null });
}

export async function updateInitiativeFromForm(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(), title: z.string().trim().min(3).max(160),
    objective: z.string().trim().min(10).max(4000),
    currentPhase: z.enum(["Validation","Design","Build","Test","Deploy","Measure"]),
    status: z.enum(["On track","At risk","Complete"]),
    nextMilestone: z.string().trim().max(2000), clientVisibleSummary: z.string().trim().max(4000),
    clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  if (input.clientVisible === "on" && !input.clientVisibleSummary)
    throw new Error("Add a client-safe summary before publishing an improvement.");
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const { data, error } = await client.from("initiatives").update({
    title: input.title, objective: input.objective, current_phase: input.currentPhase,
    status: input.status, next_milestone: input.nextMilestone || null,
    client_visible_summary: input.clientVisibleSummary || null, client_visible: input.clientVisible === "on",
  }).eq("organization_id", context.organization.id).eq("id", input.id).select("id").maybeSingle();
  if (error || !data) { console.error("Initiative update failed", { code: error?.code }); throw new Error("Unable to save the improvement."); }
  revalidatePath("/internal/initiatives"); revalidatePath("/improvements"); revalidatePath("/overview");
}
