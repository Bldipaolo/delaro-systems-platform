"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = z.union([z.string().uuid(), z.literal("")]);
const optionalMeasuredNumber = z.preprocess((value) => value === "" ? null : value, z.coerce.number().min(0).max(100000).nullable());
const base = z.object({
  id: optionalUuid, processId: z.string().uuid(), stepId: optionalUuid, systemId: optionalUuid,
  issueDescription: z.string().trim().min(5).max(2000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  frequency: z.enum(["rare", "occasional", "frequent", "continuous"]),
  status: z.enum(["open", "investigating", "planned", "resolved"]),
});

async function workspace() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  return { client, organizationId: context.organization.id };
}

export async function saveConstraint(formData: FormData) {
  const input = base.parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data: process } = await client.from("processes").select("id")
    .eq("organization_id", organizationId).eq("id", input.processId).maybeSingle();
  if (!process) throw new Error("Choose a process in this organization.");
  if (input.stepId) {
    const { data } = await client.from("process_steps").select("id").eq("organization_id", organizationId).eq("process_id", input.processId).eq("id", input.stepId).maybeSingle();
    if (!data) throw new Error("Choose a step in the selected process.");
  }
  if (input.systemId) {
    const { data } = await client.from("systems").select("id").eq("organization_id", organizationId).eq("id", input.systemId).maybeSingle();
    if (!data) throw new Error("Choose a system in this organization.");
  }
  const values = { process_id: input.processId, step_id: input.stepId || null, system_id: input.systemId || null, issue_description: input.issueDescription,
    severity: input.severity, frequency: input.frequency, status: input.status };
  const result = input.id
    ? await client.from("process_constraints").update(values).eq("organization_id", organizationId).eq("id", input.id).select("id").maybeSingle()
    : await client.from("process_constraints").insert({ ...values, organization_id: organizationId }).select("id").maybeSingle();
  if (result.error) { console.error("Constraint save failed", { code: result.error.code }); throw new Error("Unable to save this constraint."); }
  if (!result.data) throw new Error("Constraint not found in this organization.");
  revalidatePath("/internal/constraints"); revalidatePath("/operations");
}

export async function saveConstraintDiagnostic(formData: FormData) {
  const input = z.object({
    constraintId: z.string().uuid(), rootCause: z.string().trim().max(4000),
    businessConsequence: z.string().trim().max(4000), internalNotes: z.string().trim().max(10000),
    opportunityId: optionalUuid,
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data: constraint } = await client.from("process_constraints").select("id")
    .eq("organization_id", organizationId).eq("id", input.constraintId).maybeSingle();
  if (!constraint) throw new Error("Constraint not found in this organization.");
  if (input.opportunityId) {
    const { data: opportunity } = await client.from("opportunities").select("id")
      .eq("organization_id", organizationId).eq("id", input.opportunityId).maybeSingle();
    if (!opportunity) throw new Error("Opportunity not found in this organization.");
  }
  const { error } = await client.from("constraint_diagnostics").upsert({
    constraint_id: input.constraintId, organization_id: organizationId,
    root_cause: input.rootCause || null, business_consequence: input.businessConsequence || null,
    internal_notes: input.internalNotes || null, opportunity_id: input.opportunityId || null,
  }, { onConflict: "constraint_id" });
  if (error) { console.error("Constraint diagnostic save failed", { code: error.code }); throw new Error("Unable to save the diagnostic."); }
  revalidatePath("/internal/constraints");
}

export async function publishConstraint(formData: FormData) {
  const input = z.object({
    constraintId: z.string().uuid(), publish: z.enum(["yes", "no"]),
    rootCauseSummary: z.string().trim().max(2000), businessConsequenceSummary: z.string().trim().max(2000),
    measuredDelayMinutes: optionalMeasuredNumber,
    opportunitySummaryId: optionalUuid, initiativeId: optionalUuid,
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data: constraint } = await client.from("process_constraints").select("id,process_id")
    .eq("organization_id", organizationId).eq("id", input.constraintId).maybeSingle();
  if (!constraint) throw new Error("Constraint not found in this organization.");
  if (input.publish === "yes" && (!input.rootCauseSummary || !input.businessConsequenceSummary))
    throw new Error("Add reviewed client-safe cause and consequence summaries before publication.");
  if (input.publish === "yes" && constraint.process_id) {
    const { data: process } = await client.from("processes").select("client_visible")
      .eq("organization_id", organizationId).eq("id", constraint.process_id).maybeSingle();
    if (!process?.client_visible) throw new Error("Publish the linked process first.");
  }
  if (input.opportunitySummaryId) {
    const { data } = await client.from("opportunity_client_summaries").select("id").eq("organization_id", organizationId).eq("id", input.opportunitySummaryId).maybeSingle();
    if (!data) throw new Error("Choose a published opportunity from this organization.");
  }
  if (input.initiativeId) {
    const { data } = await client.from("initiatives").select("id").eq("organization_id", organizationId).eq("id", input.initiativeId).maybeSingle();
    if (!data) throw new Error("Choose an improvement from this organization.");
  }
  const { error: summaryError } = await client.from("constraint_publications").upsert({
    constraint_id: input.constraintId, organization_id: organizationId,
    root_cause_summary: input.rootCauseSummary || null,
    business_consequence_summary: input.businessConsequenceSummary || null,
    measured_delay_minutes: input.measuredDelayMinutes,
    opportunity_summary_id: input.opportunitySummaryId || null,
    initiative_id: input.initiativeId || null,
  }, { onConflict: "constraint_id" });
  if (summaryError) { console.error("Constraint publication failed", { code: summaryError.code }); throw new Error("Unable to save the client summary."); }
  const { error } = await client.from("process_constraints").update({ client_visible: input.publish === "yes" })
    .eq("organization_id", organizationId).eq("id", input.constraintId);
  if (error) { console.error("Constraint visibility update failed", { code: error.code }); throw new Error("Unable to update publication."); }
  revalidatePath("/internal/constraints"); revalidatePath("/operations");
}
