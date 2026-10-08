"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireInternalActionContext } from "@/lib/auth/context";
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
    scope: parsed.scope || null,
    owner_id: parsed.ownerId,
    current_phase: parsed.currentPhase,
    target_launch_date: parsed.targetLaunchDate,
    client_visible_summary: parsed.clientVisibleSummary || null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/initiatives");
  revalidatePath("/internal/initiatives");
  return { id: data.id };
}
