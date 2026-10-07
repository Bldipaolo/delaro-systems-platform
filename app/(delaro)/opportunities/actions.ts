"use server";

import { revalidatePath } from "next/cache";
import { calculateOpportunityScore, priorityForScore } from "@/lib/opportunities/scoring";
import { opportunityInputSchema } from "@/lib/validation/opportunity";
import { createClient } from "@/lib/supabase/server";

export async function createOpportunity(input: unknown) {
  const parsed = opportunityInputSchema.parse(input);
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

  const { data, error } = await supabase.from("opportunities").insert({
    organization_id: parsed.organizationId,
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

  if (error) throw new Error(error.message);
  revalidatePath("/opportunities");
  return { id: data.id, score, priority: priorityForScore(score) };
}
