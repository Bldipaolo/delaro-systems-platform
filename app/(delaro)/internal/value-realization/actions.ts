"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getInternalEconomicImpact } from "@/lib/data/economic-impact";

const optionalUuid = z.union([z.string().uuid(),z.literal("")]);
const nonnegative = z.string().trim().regex(/^\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().finite().nonnegative());
const optionalPercentage = z.union([z.literal(""), nonnegative.pipe(z.number().max(100))]);
const optionalNonnegative = z.union([z.literal(""), nonnegative]);

async function workspace() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  return { client, organizationId: context.organization.id, membershipId: context.membership.id };
}
function refresh() {
  revalidatePath("/internal/value-realization"); revalidatePath("/internal/business-cases");
  revalidatePath("/internal/evidence"); revalidatePath("/impact");
}

export async function createValueModel(formData: FormData) {
  const input = z.object({
    name: z.string().trim().min(3).max(160),
    opportunityId: optionalUuid, initiativeId: optionalUuid, workflowId: optionalUuid,
    category: z.enum(["labor_savings","capacity_creation","revenue_recovery","conversion_improvement",
      "response_time_improvement","error_reduction","avoided_hiring","working_capital_improvement","risk_reduction"]),
    formulaKind: z.enum(["product","positive_delta_product","negative_delta_product","minutes_to_hours_product"]),
    calculationMethod: z.string().trim().min(5).max(2000),
    annualizationBasis: z.string().trim().min(3).max(500),
    benefitStreamKey: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
    recoverablePercentage: optionalPercentage, expectedCapturePercentage: optionalPercentage,
    economicMechanism: z.string().trim().min(3).max(2000),
    timeHorizon: z.enum(["weekly","monthly","quarterly","annual","custom"]),
    attributionPercentage: optionalPercentage,
    attributionRationale: z.string().trim().max(2000),
  }).parse(Object.fromEntries(formData));
  if (!input.opportunityId && !input.initiativeId && !input.workflowId) throw new Error("Link the value model to an opportunity, improvement, or workflow.");
  if ((input.attributionPercentage === "") !== (input.attributionRationale === ""))
    throw new Error("An attribution percentage requires a documented rationale.");
  const { client, organizationId } = await workspace();
  const { error } = await client.from("value_models").insert({
    organization_id: organizationId, name: input.name,
    opportunity_id: input.opportunityId || null, initiative_id: input.initiativeId || null, workflow_id: input.workflowId || null,
    category: input.category, formula_kind: input.formulaKind,
    calculation_method: input.calculationMethod, annualization_basis: input.annualizationBasis,
    benefit_stream_key: input.benefitStreamKey, recoverable_percentage: input.recoverablePercentage === "" ? null : input.recoverablePercentage,
    expected_capture_percentage: input.expectedCapturePercentage === "" ? null : input.expectedCapturePercentage,
    economic_mechanism: input.economicMechanism, time_horizon: input.timeHorizon,
    attribution_percentage: input.attributionPercentage === "" ? null : input.attributionPercentage,
    attribution_rationale: input.attributionRationale || null,
    confidence: "pending", client_visible: false, status: "draft",
  });
  if (error) { console.error("Value model creation failed", { code: error.code }); throw new Error("Unable to save this value model."); }
  refresh();
}

export async function addValueInput(formData: FormData) {
  const input = z.object({
    modelId: z.string().uuid(), inputKey: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().trim().min(2).max(160), role: z.enum(["factor","baseline","target"]),
    value: optionalNonnegative, unit: z.string().trim().min(1).max(80),
    origin: z.enum(["known","client_assumption","delaro_assumption"]),
    metricId: optionalUuid,
    derivation: z.enum(["manual","metric_baseline","metric_latest_verified","metric_latest_observed","metric_improvement_absolute","metric_improvement_percentage"]),
    staleAfterDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(3650)]),
    sensitivityLow: optionalNonnegative, sensitivityHigh: optionalNonnegative,
    sourceDescription: z.string().trim().min(3).max(1000),
    clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  if (input.derivation === "manual" && input.value === "") throw new Error("Enter a value for a manual input.");
  if (input.derivation !== "manual" && !input.metricId) throw new Error("Choose the source metric for an automatic input.");
  if (input.sensitivityLow !== "" && input.sensitivityHigh !== "" && input.sensitivityLow > input.sensitivityHigh)
    throw new Error("The sensitivity low value cannot exceed the high value.");
  const { client, organizationId } = await workspace();
  const { data: model } = await client.from("value_models").select("id,status,client_visible")
    .eq("organization_id", organizationId).eq("id", input.modelId).maybeSingle();
  if (!model) throw new Error("Value model not found in this organization.");
  if (model.status === "active" && model.client_visible) throw new Error("Withdraw the published model before editing inputs.");
  const { error } = await client.from("value_model_inputs").upsert({
    organization_id: organizationId, model_id: input.modelId, input_key: input.inputKey,
    label: input.label, role: input.role, value: input.derivation === "manual" ? input.value : null, unit: input.unit,
    origin: input.origin, source_description: input.sourceDescription,
    metric_id: input.derivation === "manual" ? null : input.metricId,
    derivation: input.derivation, stale_after_days: input.staleAfterDays === "" ? null : input.staleAfterDays,
    sensitivity_low: input.sensitivityLow === "" ? null : input.sensitivityLow,
    sensitivity_high: input.sensitivityHigh === "" ? null : input.sensitivityHigh,
    client_visible: input.clientVisible === "on",
  }, { onConflict: "organization_id,model_id,input_key" });
  if (error) { console.error("Value input save failed", { code: error.code }); throw new Error("Unable to save this calculation input."); }
  refresh();
}

export async function linkValueModel(formData: FormData) {
  const input = z.object({ modelId: z.string().uuid(), metricId: optionalUuid, workflowId: optionalUuid,
    relationship: z.enum(["driver","volume","quality","attribution","cost"]), clientVisible: z.string().optional() })
    .parse(Object.fromEntries(formData));
  if (!input.metricId && !input.workflowId) throw new Error("Choose a metric or workflow to link.");
  const { client, organizationId } = await workspace();
  const { data: model } = await client.from("value_models").select("id,status,client_visible")
    .eq("organization_id", organizationId).eq("id", input.modelId).maybeSingle();
  if (!model) throw new Error("Value model not found in this organization.");
  if (model.status === "active" && model.client_visible) throw new Error("Withdraw the published model before changing its relationships.");
  if (input.metricId) {
    const { error } = await client.from("value_model_metric_links").upsert({ organization_id: organizationId,
      model_id: input.modelId, metric_id: input.metricId, relationship: input.relationship,
      client_visible: input.clientVisible === "on" }, { onConflict: "organization_id,model_id,metric_id,relationship" });
    if (error) throw new Error("Unable to link this metric.");
  }
  if (input.workflowId) {
    const { error } = await client.from("value_model_workflows").upsert({ organization_id: organizationId,
      model_id: input.modelId, workflow_id: input.workflowId, client_visible: input.clientVisible === "on" },
      { onConflict: "organization_id,model_id,workflow_id" });
    if (error) throw new Error("Unable to link this workflow.");
  }
  refresh(); revalidatePath("/workflows");
}

export async function addValueCost(formData: FormData) {
  const input = z.object({ modelId: z.string().uuid(), category: z.enum(["implementation","software","api","infrastructure","maintenance","delaro_fee","client_labor","other"]),
    label: z.string().trim().min(2).max(160), amount: nonnegative, currencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
    cadence: z.enum(["one_time","monthly","quarterly","annual","custom"]), annualizationFactor: optionalNonnegative,
    sourceDescription: z.string().trim().min(3).max(1000), evidenceId: optionalUuid, clientVisible: z.string().optional() })
    .parse(Object.fromEntries(formData));
  if ((input.cadence === "custom") !== (input.annualizationFactor !== "")) throw new Error("Custom costs require an annualization factor; standard cadences do not.");
  const { client, organizationId } = await workspace();
  const { error } = await client.from("value_model_costs").insert({ organization_id: organizationId, model_id: input.modelId,
    category: input.category, label: input.label, amount: input.amount, currency_code: input.currencyCode,
    cadence: input.cadence, annualization_factor: input.annualizationFactor === "" ? null : input.annualizationFactor,
    source_description: input.sourceDescription, evidence_id: input.evidenceId || null,
    verification_status: input.evidenceId ? "submitted" : "pending", client_visible: input.clientVisible === "on" });
  if (error) throw new Error("Unable to save this economic cost.");
  refresh();
}

export async function requestValueValidation(formData: FormData) {
  const input = z.object({ modelId: z.string().uuid(), requestedFromMembershipId: z.string().uuid(), requestNote: z.string().trim().min(3).max(2000) })
    .parse(Object.fromEntries(formData));
  const { client, organizationId, membershipId } = await workspace();
  const { error } = await client.from("value_model_validations").insert({ organization_id: organizationId, model_id: input.modelId,
    requested_from_membership_id: input.requestedFromMembershipId, requested_by_membership_id: membershipId,
    request_note: input.requestNote, status: "pending" });
  if (error) throw new Error("Unable to request client validation.");
  refresh();
}

export async function publishValueModel(formData: FormData) {
  const input = z.object({ modelId: z.string().uuid(), visibility: z.enum(["draft","published"]) })
    .parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  if (input.visibility === "published") {
    const { models } = await getInternalEconomicImpact();
    const model = models.find((item) => item.id === input.modelId);
    if (!model || !model.valid) throw new Error("Complete and review the calculation inputs before publishing.");
  }
  const values = input.visibility === "published"
    ? { status: "active", client_visible: true }
    : { status: "draft", client_visible: false };
  const { data, error } = await client.from("value_models").update(values)
    .eq("organization_id", organizationId).eq("id", input.modelId).select("id").maybeSingle();
  if (error || !data) { console.error("Value model publication failed", { code: error?.code }); throw new Error("Unable to change publication. Check that every input is client-visible."); }
  refresh();
}

export async function submitValueEvidence(formData: FormData) {
  const input = z.object({
    modelId: z.string().uuid(), sourceType: z.enum(["system_export","document","sample","client_record","audit","other"]),
    sourceReference: z.string().trim().min(3).max(1000),
    description: z.string().trim().max(4000), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data: model } = await client.from("value_models").select("id")
    .eq("organization_id", organizationId).eq("id", input.modelId).maybeSingle();
  if (!model) throw new Error("Value model not found in this organization.");
  const { error } = await client.from("value_evidence").insert({
    organization_id: organizationId, model_id: input.modelId,
    source_type: input.sourceType, source_reference: input.sourceReference,
    description: input.description || null, verification_status: "submitted",
    client_visible: input.clientVisible === "on",
  });
  if (error) { console.error("Value evidence submission failed", { code: error.code }); throw new Error("Unable to submit source evidence."); }
  refresh();
}

export async function submitRealization(formData: FormData) {
  const input = z.object({
    modelId: z.string().uuid(), evidenceId: z.string().uuid(),
    periodStart: z.string().date(), periodEnd: z.string().date(),
    realizedUnits: nonnegative, unitValue: nonnegative,
    unitLabel: z.string().trim().min(1).max(80),
    annualizationFactor: z.union([z.literal(""),nonnegative.pipe(z.number().positive().max(366))]),
    annualizationMethod: z.string().trim().max(500),
    realizationState: z.enum(["observed","realized"]), sourceDescription: z.string().trim().min(3).max(1000),
    clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  if (input.periodEnd < input.periodStart) throw new Error("The period end must follow the start.");
  if ((input.annualizationFactor === "") !== (input.annualizationMethod === ""))
    throw new Error("An annualization factor needs a documented method.");
  const { client, organizationId } = await workspace();
  const { data: evidence } = await client.from("value_evidence").select("id")
    .eq("organization_id", organizationId).eq("model_id", input.modelId).eq("id", input.evidenceId).maybeSingle();
  if (!evidence) throw new Error("Choose source evidence for this model.");
  const { error } = await client.from("value_realization_snapshots").insert({
    organization_id: organizationId, model_id: input.modelId, evidence_id: input.evidenceId,
    period_start: input.periodStart, period_end: input.periodEnd, measured_at: new Date().toISOString(),
    realized_units: input.realizedUnits, unit_value: input.unitValue, unit_label: input.unitLabel,
    annualization_factor: input.annualizationFactor === "" ? null : input.annualizationFactor,
    annualization_method: input.annualizationMethod || null, verification_status: "submitted",
    realization_state: input.realizationState, source_description: input.sourceDescription,
    client_visible: input.clientVisible === "on",
  });
  if (error) { console.error("Realization submission failed", { code: error.code }); throw new Error("Unable to submit this realized-value period."); }
  refresh();
}

export async function reviewRealization(formData: FormData) {
  const input = z.object({ id: z.string().uuid(), outcome: z.enum(["verified","rejected"]) })
    .parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data, error } = await client.from("value_realization_snapshots")
    .update({ verification_status: input.outcome })
    .eq("organization_id", organizationId).eq("id", input.id)
    .in("verification_status", ["pending","submitted"]).select("id").maybeSingle();
  if (error) { console.error("Realization review failed", { code: error.code }); throw new Error("Unable to verify realized value. Confirm the period and its evidence."); }
  if (!data) throw new Error("This result is no longer awaiting review.");
  refresh();
}

export async function reviewValueCost(formData: FormData) {
  const input = z.object({ id: z.string().uuid(), outcome: z.enum(["verified","rejected"]) })
    .parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { data, error } = await client.from("value_model_costs").update({ verification_status: input.outcome })
    .eq("organization_id", organizationId).eq("id", input.id).in("verification_status", ["pending","submitted"])
    .select("id").maybeSingle();
  if (error || !data) throw new Error("Unable to review this cost. Verified costs require verified evidence.");
  refresh();
}

export async function approveValueAggregation(formData: FormData) {
  const input = z.object({ modelId: z.string().uuid(), confirmation: z.literal("APPROVE") })
    .parse(Object.fromEntries(formData));
  const { client, organizationId } = await workspace();
  const { models } = await getInternalEconomicImpact();
  const model = models.find((item) => item.id === input.modelId);
  if (!model?.valid || model.realisticallyRecoverable === null || model.expectedAnnualValue === null)
    throw new Error("A complete, documented model with recoverable and expected values is required.");
  const { data, error } = await client.from("value_models")
    .update({ aggregation_approved_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", input.modelId)
    .eq("status", "active").eq("client_visible", true).is("aggregation_approved_at", null)
    .select("id").maybeSingle();
  if (error || !data) { console.error("Value aggregation approval failed", { code: error?.code }); throw new Error("Unable to approve this value stream."); }
  refresh();
}
