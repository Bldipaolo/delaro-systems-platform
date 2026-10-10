"use server";

import { revalidatePath } from "next/cache";
import { calculateOpportunityScore, priorityForScore } from "@/lib/opportunities/scoring";
import { opportunityInputSchema } from "@/lib/validation/opportunity";
import { createClient } from "@/lib/supabase/server";
import { requireInternalActionContext, requireInternalUserContext } from "@/lib/auth/context";
import { assertOrganizationMemberReference } from "@/lib/auth/references";
import { z } from "zod";

export async function createOpportunity(input: unknown) {
  const parsed = opportunityInputSchema.parse(input);
  const context = await requireInternalActionContext(parsed.organizationId);
  const score = calculateOpportunityScore({
    financialImpact: parsed.financialImpact,
    frequency: parsed.frequency,
    addressability: parsed.addressability,
    measurementQuality: parsed.measurementQuality,
    strategicLeverage: parsed.strategicLeverage,
    implementationDifficulty: parsed.implementationDifficulty,
    organizationalComplexity: parsed.organizationalComplexity,
    risk: parsed.risk,
  });
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  await assertOrganizationMemberReference(supabase, context.organization.id, parsed.ownerId);

  const { data, error } = await supabase.from("opportunities").insert({
    organization_id: context.organization.id,
    title: parsed.title,
    department_or_process: parsed.process,
    current_state_problem: parsed.currentStateProblem,
    root_cause: parsed.rootCause || null,
    business_consequence: parsed.businessConsequence,
    estimated_annual_value: parsed.estimatedAnnualValue,
    financial_impact_score: parsed.financialImpact,
    frequency_score: parsed.frequency,
    addressability_score: parsed.addressability,
    measurement_quality_score: parsed.measurementQuality,
    strategic_leverage_score: parsed.strategicLeverage,
    implementation_difficulty_score: parsed.implementationDifficulty,
    organizational_complexity_score: parsed.organizationalComplexity,
    risk_score: parsed.risk,
    opportunity_score: score,
    evidence_quality: parsed.evidenceQuality,
    priority: priorityForScore(score),
    status: parsed.status,
    owner_id: parsed.ownerId,
    next_action: parsed.nextAction || null,
    internal_notes: parsed.internalNotes || null,
  }).select("id").single();

  if (error) { console.error("Opportunity creation failed", { code: error.code }); throw new Error("Unable to save the opportunity."); }
  revalidatePath("/opportunities");
  return { id: data.id, score, priority: priorityForScore(score) };
}

const scored = z.coerce.number().int().min(1).max(5);
export async function createOpportunityFromForm(formData: FormData) {
  const input = z.object({
    title: z.string().trim().min(3).max(160), process: z.string().trim().min(2).max(120),
    currentStateProblem: z.string().trim().min(10).max(4000), rootCause: z.string().trim().max(4000),
    businessConsequence: z.string().trim().min(10).max(4000),
    estimatedAnnualValue: z.string(), evidenceQuality: z.enum(["Low", "Medium", "High"]),
    financialImpact: scored, frequency: scored, addressability: scored, measurementQuality: scored,
    strategicLeverage: scored, implementationDifficulty: scored, organizationalComplexity: scored, risk: scored,
  }).parse(Object.fromEntries(formData));
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  await createOpportunity({
    ...input, organizationId: context.organization.id,
    estimatedAnnualValue: input.estimatedAnnualValue.trim() ? Number(input.estimatedAnnualValue) : null,
    status: "Investigate", ownerId: null, nextAction: "", internalNotes: "",
  });
}

export async function updateOpportunityStatus(formData: FormData) {
  const input = z.object({ id: z.string().uuid(), status: z.enum([
    "Investigate", "Qualified", "Prioritized", "Proposed", "Approved",
    "Implementing", "Measuring", "Complete", "Rejected",
  ]) }).parse(Object.fromEntries(formData));
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const { data, error } = await client.from("opportunities").update({ status: input.status })
    .eq("organization_id", context.organization.id).eq("id", input.id).select("id").maybeSingle();
  if (error || !data) { console.error("Opportunity status update failed", { code: error?.code }); throw new Error("Unable to update the opportunity."); }
  revalidatePath("/opportunities");
}

export async function publishOpportunitySummary(formData: FormData) {
  const input = z.object({
    opportunityId: z.string().uuid(), title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(10).max(4000),
  }).parse(Object.fromEntries(formData));
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const organizationId = context.organization.id;
  const { data: opportunity } = await client.from("opportunities").select("id,priority,status")
    .eq("organization_id", organizationId).eq("id", input.opportunityId).maybeSingle();
  if (!opportunity) throw new Error("Opportunity not found in this organization.");
  const { error } = await client.from("opportunity_client_summaries").upsert({
    opportunity_id: input.opportunityId, organization_id: organizationId,
    title: input.title, summary: input.summary, priority: opportunity.priority, status: opportunity.status,
  }, { onConflict: "opportunity_id" });
  if (error) { console.error("Opportunity publication failed", { code: error.code }); throw new Error("Unable to publish the opportunity summary."); }
  revalidatePath("/opportunities"); revalidatePath("/operations"); revalidatePath("/overview");
}
