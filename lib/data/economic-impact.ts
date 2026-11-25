import { requireCurrentUserContext, requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { calculateValueModel, summarizeEconomicImpact } from "@/lib/economic-impact/calculate";
import { demoValueModels } from "@/lib/economic-impact/demo";
import { calculateImprovement } from "@/lib/measurement/calculations";
import type { CalculatedValueModel, EconomicSummary, ValueCategory, ValueCost, ValueEvidence, ValueInput, ValueModel, ValueValidation } from "@/lib/economic-impact/types";
import { safeEvidenceUrl } from "@/lib/security/safe-url";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Row = Record<string, unknown>;

export type RealizationReviewRecord = {
  id: string;
  modelId: string;
  periodStart: string;
  periodEnd: string;
  measuredAt: string;
  realizedValue: number;
  annualizedRunRate: number | null;
  verificationStatus: "pending" | "submitted" | "verified" | "rejected";
  evidenceId: string | null;
  evidenceStatus: "pending" | "submitted" | "verified" | "rejected";
  evidenceReference: string | null;
};

async function rows(client: Client, table: string, selection: string, organizationId: string): Promise<Row[]> {
  const { data, error } = await client.from(table).select(selection).eq("organization_id", organizationId);
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

function text(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latest(items: Row[], dateField: string): Row | undefined {
  return [...items].sort((a, b) => String(b[dateField] ?? "").localeCompare(String(a[dateField] ?? "")))[0];
}

function resolveInput(input: Row, metricRows: Row[], baselineRows: Row[], observationRows: Row[]): ValueInput {
  const metricId = text(input.metric_id);
  const derivation = String(input.derivation ?? "manual") as ValueInput["derivation"];
  const metric = metricRows.find((item) => item.id === metricId);
  const baselines = baselineRows.filter((item) => item.metric_id === metricId && item.verification_status === "verified");
  const observations = observationRows.filter((item) => item.metric_id === metricId && item.verification_status !== "rejected");
  const verified = observations.filter((item) => item.verification_status === "verified");
  const baseline = latest(baselines, "verified_at") ?? baselines[0];
  const latestVerified = latest(verified, "measured_at");
  const latestObserved = latest(observations, "measured_at");
  let value = numeric(input.value);
  let measuredAt: string | null = null;
  if (derivation === "metric_baseline") {
    value = numeric(baseline?.value); measuredAt = text(baseline?.verified_at) ?? text(baseline?.period_end);
  } else if (derivation === "metric_latest_verified") {
    value = numeric(latestVerified?.measured_value); measuredAt = text(latestVerified?.measured_at);
  } else if (derivation === "metric_latest_observed") {
    value = numeric(latestObserved?.measured_value); measuredAt = text(latestObserved?.measured_at);
  } else if (derivation === "metric_improvement_absolute" || derivation === "metric_improvement_percentage") {
    const baselineValue = numeric(baseline?.value); const currentValue = numeric(latestVerified?.measured_value);
    if (baselineValue !== null && currentValue !== null && metric) {
      const result = calculateImprovement(baselineValue, currentValue, String(metric.improvement_direction) as "increase" | "decrease" | "target", null);
      value = derivation === "metric_improvement_percentage" ? (result.percentage === null ? null : result.percentage * 100) : result.absolute;
      if (!result.favorable) value = null;
      measuredAt = text(latestVerified?.measured_at);
    } else value = null;
  }
  const staleAfterDays = numeric(input.stale_after_days);
  const measuredTime = measuredAt ? Date.parse(measuredAt) : Number.NaN;
  const stale = staleAfterDays !== null && Number.isFinite(measuredTime) && Date.now() - measuredTime > staleAfterDays * 86_400_000;
  return {
    id: String(input.id), key: String(input.input_key), label: String(input.label), role: input.role as ValueInput["role"],
    value: value ?? Number.NaN, unit: String(input.unit), origin: input.origin as ValueInput["origin"],
    sourceDescription: String(input.source_description), evidenceId: text(input.evidence_id), metricId, derivation,
    measuredAt, staleAfterDays, stale, sensitivityLow: numeric(input.sensitivity_low), sensitivityHigh: numeric(input.sensitivity_high),
  };
}

async function getEconomicImpact(internal: boolean): Promise<{ models: CalculatedValueModel[]; summary: EconomicSummary; realizationReviews: RealizationReviewRecord[] }> {
  const context = internal ? await requireInternalUserContext() : await requireCurrentUserContext();
  if (!context) {
    const models = demoValueModels.map(calculateValueModel);
    return { models, summary: summarizeEconomicImpact(models), realizationReviews: [] };
  }
  const client = await createClient();
  if (!client) throw new Error("Supabase is not configured.");
  const organizationId = context.organization.id;
  const [modelRows, inputRows, evidenceRows, snapshotRows, initiativeRows, metricRows, baselineRows, observationRows, metricLinkRows, workflowLinkRows, costRows, validationRows] = await Promise.all([
    rows(client, "value_models", "id,organization_id,initiative_id,opportunity_id,workflow_id,metric_id,name,category,formula_kind,calculation_method,annualization_basis,currency_code,benefit_stream_key,recoverable_percentage,expected_capture_percentage,confidence,confidence_rationale,economic_mechanism,time_horizon,attribution_percentage,attribution_rationale,client_visible,status,aggregation_approved_at", organizationId),
    rows(client, "value_model_inputs", "id,organization_id,model_id,input_key,label,role,value,unit,origin,source_description,evidence_id,metric_id,derivation,stale_after_days,sensitivity_low,sensitivity_high,client_visible,sort_order", organizationId),
    rows(client, "value_evidence", "id,organization_id,model_id,source_type,source_reference,document_url,description,verification_status,client_visible", organizationId),
    rows(client, "value_realization_snapshots", "id,organization_id,model_id,period_start,period_end,measured_at,realized_units,unit_value,unit_label,realized_value,annualization_factor,annualized_run_rate,annualization_method,evidence_id,verification_status,realization_state,client_visible,source_description", organizationId),
    rows(client, "initiatives", "id,organization_id,title", organizationId),
    rows(client, "measurement_metrics", "id,organization_id,name,unit,improvement_direction,client_visible", organizationId),
    rows(client, "metric_baselines", "id,organization_id,metric_id,value,period_start,period_end,verification_status,verified_at", organizationId),
    rows(client, "metric_observations", "id,organization_id,metric_id,measured_value,measured_at,period_start,period_end,verification_status,measurement_status", organizationId),
    rows(client, "value_model_metric_links", "id,organization_id,model_id,metric_id,relationship,client_visible", organizationId),
    rows(client, "value_model_workflows", "id,organization_id,model_id,workflow_id,client_visible", organizationId),
    rows(client, "value_model_costs", "id,organization_id,model_id,category,label,amount,currency_code,cadence,annualization_factor,source_description,evidence_id,verification_status,client_visible", organizationId),
    rows(client, "value_model_validations", "id,organization_id,model_id,status,request_note,response_note,responded_at", organizationId),
  ]);
  const initiativeNames = new Map(initiativeRows.map((item) => [String(item.id), String(item.title)]));

  const models: CalculatedValueModel[] = modelRows
    .filter((row) => internal || (row.client_visible === true && row.status === "active"))
    .map((row) => {
      const id = String(row.id);
      const inputs: ValueInput[] = inputRows
        .filter((input) => input.model_id === id && (internal || input.client_visible === true))
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((input) => resolveInput(input, metricRows, baselineRows, observationRows));
      const evidence: ValueEvidence[] = evidenceRows.filter((item) => item.model_id === id && (internal || item.client_visible === true)).map((item) => ({
        id: String(item.id), sourceType: String(item.source_type), sourceReference: String(item.source_reference),
        description: text(item.description), documentUrl: safeEvidenceUrl(item.document_url),
        verificationStatus: item.verification_status as ValueEvidence["verificationStatus"],
      }));
      const snapshots = snapshotRows.filter((snapshot) => snapshot.model_id === id && snapshot.verification_status !== "rejected")
        .map((snapshot) => ({
          id: String(snapshot.id), periodStart: String(snapshot.period_start), periodEnd: String(snapshot.period_end),
          measuredAt: String(snapshot.measured_at), realizedUnits: numeric(snapshot.realized_units) ?? Number.NaN,
          unitValue: numeric(snapshot.unit_value) ?? Number.NaN, unitLabel: String(snapshot.unit_label),
          realizedValue: numeric(snapshot.realized_value) ?? Number.NaN,
          annualizationFactor: numeric(snapshot.annualization_factor), annualizedRunRate: numeric(snapshot.annualized_run_rate),
          annualizationMethod: text(snapshot.annualization_method), evidenceId: String(snapshot.evidence_id),
          verificationStatus: snapshot.verification_status as ValueModel["snapshots"][number]["verificationStatus"],
          realizationState: snapshot.realization_state as "observed" | "realized", clientVisible: snapshot.client_visible === true,
          sourceDescription: text(snapshot.source_description),
        }));
      const costs: ValueCost[] = costRows.filter((cost) => cost.model_id === id && (internal || cost.client_visible === true)).map((cost) => ({
        id: String(cost.id), category: cost.category as ValueCost["category"], label: String(cost.label), amount: numeric(cost.amount) ?? Number.NaN,
        currencyCode: String(cost.currency_code), cadence: cost.cadence as ValueCost["cadence"], annualizationFactor: numeric(cost.annualization_factor),
        sourceDescription: String(cost.source_description), evidenceId: text(cost.evidence_id), verificationStatus: cost.verification_status as ValueCost["verificationStatus"],
      }));
      const validations: ValueValidation[] = validationRows.filter((validation) => validation.model_id === id).map((validation) => ({
        id: String(validation.id), status: validation.status as ValueValidation["status"], requestNote: text(validation.request_note),
        responseNote: text(validation.response_note), respondedAt: text(validation.responded_at),
      }));
      const metricIds = [...new Set([text(row.metric_id), ...metricLinkRows.filter((link) => link.model_id === id).map((link) => text(link.metric_id))].filter((value): value is string => Boolean(value)))];
      const model: ValueModel = {
        id, initiativeId: text(row.initiative_id), initiativeName: initiativeNames.get(String(row.initiative_id)) ?? null,
        opportunityId: text(row.opportunity_id), workflowId: text(row.workflow_id), metricId: text(row.metric_id), metricIds,
        workflowIds: [...new Set([text(row.workflow_id), ...workflowLinkRows.filter((link) => link.model_id === id).map((link) => text(link.workflow_id))].filter((value): value is string => Boolean(value)))],
        name: String(row.name), category: row.category as ValueCategory, formulaKind: row.formula_kind as ValueModel["formulaKind"],
        calculationMethod: String(row.calculation_method), annualizationBasis: String(row.annualization_basis), currencyCode: String(row.currency_code),
        benefitStreamKey: String(row.benefit_stream_key), recoverablePercentage: numeric(row.recoverable_percentage),
        expectedCapturePercentage: numeric(row.expected_capture_percentage), confidence: row.confidence as ValueModel["confidence"],
        confidenceRationale: text(row.confidence_rationale),
        economicMechanism: text(row.economic_mechanism), timeHorizon: row.time_horizon as ValueModel["timeHorizon"],
        attributionPercentage: numeric(row.attribution_percentage), attributionRationale: text(row.attribution_rationale),
        aggregationApproved: row.aggregation_approved_at !== null, inputs, evidence, snapshots, costs, validations, demo: false,
      };
      return calculateValueModel(model);
    });
  const evidenceById = new Map(evidenceRows.map((item) => [String(item.id), item]));
  const realizationReviews: RealizationReviewRecord[] = internal ? snapshotRows.map((snapshot) => {
    const evidence = evidenceById.get(String(snapshot.evidence_id));
    return {
      id: String(snapshot.id), modelId: String(snapshot.model_id),
      periodStart: String(snapshot.period_start), periodEnd: String(snapshot.period_end), measuredAt: String(snapshot.measured_at),
      realizedValue: numeric(snapshot.realized_value) ?? Number.NaN, annualizedRunRate: numeric(snapshot.annualized_run_rate),
      verificationStatus: snapshot.verification_status as RealizationReviewRecord["verificationStatus"],
      evidenceId: text(snapshot.evidence_id), evidenceStatus: (evidence?.verification_status ?? "pending") as RealizationReviewRecord["evidenceStatus"],
      evidenceReference: text(evidence?.source_reference),
    };
  }).filter((item) => Number.isFinite(item.realizedValue)).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)) : [];
  return { models, summary: summarizeEconomicImpact(models), realizationReviews };
}

export async function getClientEconomicImpact() {
  const { models, summary } = await getEconomicImpact(false);
  return { models, summary };
}
export async function getInternalEconomicImpact() { return getEconomicImpact(true); }
