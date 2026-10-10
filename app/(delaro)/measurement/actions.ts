"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = z.union([z.string().uuid(), z.literal("")]);
const amount = z.string().trim().regex(/^-?\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().finite());

async function workspace() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  return { client, organizationId: context.organization.id, membershipId: context.membership.id };
}

function refresh() {
  revalidatePath("/measurement"); revalidatePath("/internal/evidence");
  revalidatePath("/impact"); revalidatePath("/internal/value-realization");
}

export async function saveMetric(formData: FormData) {
  const input = z.object({
    name: z.string().trim().min(2).max(160), description: z.string().trim().max(2000),
    unit: z.string().trim().min(1).max(40), improvementDirection: z.enum(["increase","decrease","target"]),
    processId: optionalUuid, initiativeId: optionalUuid,
    measurementMethod: z.string().trim().max(2000), cadence: z.string().trim().max(120),
    clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  if (!input.processId && !input.initiativeId) throw new Error("Link the measure to a process or improvement.");
  const { client, organizationId, membershipId } = await workspace();
  const { error } = await client.from("measurement_metrics").insert({
    organization_id: organizationId, name: input.name, description: input.description || null, unit: input.unit,
    improvement_direction: input.improvementDirection,
    process_id: input.processId || null, initiative_id: input.initiativeId || null,
    measurement_method: input.measurementMethod || null, cadence: input.cadence || null,
    owner_membership_id: membershipId, client_visible: input.clientVisible === "on",
  });
  if (error) { console.error("Metric save failed", { code: error.code }); throw new Error("Unable to save this metric."); }
  refresh();
}

export async function submitMetricEvidence(formData: FormData) {
  const input = z.object({
    metricId: z.string().uuid(), sourceType: z.enum(["system_export","document","manual_record","audit","other"]),
    sourceReference: z.string().trim().min(3).max(1000),
    description: z.string().trim().max(4000), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data: metric } = await client.from("measurement_metrics").select("id")
    .eq("organization_id", organizationId).eq("id", input.metricId).maybeSingle();
  if (!metric) throw new Error("Metric not found in this organization.");
  const { error } = await client.from("measurement_evidence").insert({
    organization_id: organizationId, metric_id: input.metricId, source_type: input.sourceType,
    source_reference: input.sourceReference, description: input.description || null,
    client_visible: input.clientVisible === "on", verification_status: "submitted",
  });
  if (error) { console.error("Metric evidence submit failed", { code: error.code }); throw new Error("Unable to submit this evidence."); }
  refresh();
}

export async function saveMetricTarget(formData: FormData) {
  const input = z.object({
    metricId: z.string().uuid(), value: amount, targetDate: z.union([z.string().date(),z.literal("")]),
    rationale: z.string().trim().max(2000),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId, membershipId } = await workspace();
  const { data: metric } = await client.from("measurement_metrics").select("id")
    .eq("organization_id", organizationId).eq("id", input.metricId).maybeSingle();
  if (!metric) throw new Error("Metric not found in this organization.");
  const { error } = await client.from("metric_targets").upsert({
    organization_id: organizationId, metric_id: input.metricId, value: input.value,
    target_date: input.targetDate || null, rationale: input.rationale || null, set_by_membership_id: membershipId,
  }, { onConflict: "organization_id,metric_id" });
  if (error) { console.error("Target save failed", { code: error.code }); throw new Error("Unable to save this target."); }
  refresh();
}

export async function submitMetricBaseline(formData: FormData) {
  const input = z.object({
    metricId: z.string().uuid(), value: amount, evidenceId: z.string().uuid(),
    periodStart: z.union([z.string().date(),z.literal("")]), periodEnd: z.union([z.string().date(),z.literal("")]),
    sourceDescription: z.string().trim().max(2000),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data: evidence } = await client.from("measurement_evidence").select("id")
    .eq("organization_id", organizationId).eq("metric_id", input.metricId).eq("id", input.evidenceId).maybeSingle();
  if (!evidence) throw new Error("Select evidence for this metric.");
  const { error } = await client.from("metric_baselines").upsert({
    organization_id: organizationId, metric_id: input.metricId, value: input.value,
    period_start: input.periodStart || null, period_end: input.periodEnd || null,
    evidence_id: input.evidenceId, source_description: input.sourceDescription || null,
    verification_status: "submitted",
  }, { onConflict: "organization_id,metric_id" });
  if (error) { console.error("Baseline submit failed", { code: error.code }); throw new Error("Unable to submit this baseline. A verified baseline cannot be replaced."); }
  refresh();
}

export async function submitMetricObservation(formData: FormData) {
  const input = z.object({
    metricId: z.string().uuid(), value: amount, evidenceId: z.string().uuid(),
    periodStart: z.union([z.string().date(),z.literal("")]), periodEnd: z.union([z.string().date(),z.literal("")]),
    sourceDescription: z.string().trim().max(2000),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId, membershipId } = await workspace();
  const { data: evidence } = await client.from("measurement_evidence").select("id")
    .eq("organization_id", organizationId).eq("metric_id", input.metricId).eq("id", input.evidenceId).maybeSingle();
  if (!evidence) throw new Error("Select evidence for this metric.");
  const { error } = await client.from("metric_observations").insert({
    organization_id: organizationId, metric_id: input.metricId, measured_value: input.value,
    measured_at: new Date().toISOString(), period_start: input.periodStart || null,
    period_end: input.periodEnd || null, source_description: input.sourceDescription || null,
    evidence_id: input.evidenceId, entered_by_membership_id: membershipId, verification_status: "submitted",
  });
  if (error) { console.error("Observation submit failed", { code: error.code }); throw new Error("Unable to submit this observation."); }
  refresh();
}

export async function reviewMetricResult(formData: FormData) {
  const input = z.object({
    kind: z.enum(["baseline","observation"]), id: z.string().uuid(),
    outcome: z.enum(["verified","rejected"]),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const table = input.kind === "baseline" ? "metric_baselines" : "metric_observations";
  const { data, error } = await client.from(table).update({ verification_status: input.outcome })
    .eq("organization_id", organizationId).eq("id", input.id)
    .in("verification_status", ["pending","submitted"]).select("id").maybeSingle();
  if (error) { console.error("Measurement review failed", { table, code: error.code }); throw new Error("Unable to review this result. Check that its evidence is verified and client-visible."); }
  if (!data) throw new Error("This result is no longer awaiting review.");
  refresh();
}
