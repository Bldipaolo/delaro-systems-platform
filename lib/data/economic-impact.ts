import { requireCurrentUserContext, requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { calculateValueModel, summarizeEconomicImpact } from "@/lib/economic-impact/calculate";
import { demoValueModels } from "@/lib/economic-impact/demo";
import type { CalculatedValueModel, EconomicSummary, ValueCategory, ValueEvidence, ValueInput, ValueModel } from "@/lib/economic-impact/types";
import { safeEvidenceUrl } from "@/lib/security/safe-url";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Row = Record<string, unknown>;

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

async function getEconomicImpact(internal: boolean): Promise<{ models: CalculatedValueModel[]; summary: EconomicSummary }> {
  const context = internal ? await requireInternalUserContext() : await requireCurrentUserContext();
  if (!context) {
    const models = demoValueModels.map(calculateValueModel);
    return { models, summary: summarizeEconomicImpact(models) };
  }
  const client = await createClient();
  if (!client) throw new Error("Supabase is not configured.");
  const organizationId = context.organization.id;
  const [modelRows, inputRows, evidenceRows, snapshotRows] = await Promise.all([
    rows(client, "value_models", "id,organization_id,initiative_id,opportunity_id,metric_id,name,category,formula_kind,calculation_method,annualization_basis,currency_code,benefit_stream_key,recoverable_percentage,expected_capture_percentage,confidence,confidence_rationale,client_visible,status,aggregation_approved_at", organizationId),
    rows(client, "value_model_inputs", "id,organization_id,model_id,input_key,label,role,value,unit,origin,source_description,evidence_id,client_visible,sort_order", organizationId),
    rows(client, "value_evidence", "id,organization_id,model_id,source_type,source_reference,document_url,description,verification_status,client_visible", organizationId),
    rows(client, "value_realization_snapshots", "id,organization_id,model_id,period_start,period_end,measured_at,realized_units,unit_value,unit_label,realized_value,annualization_factor,annualized_run_rate,annualization_method,evidence_id,verification_status", organizationId),
  ]);

  const models: CalculatedValueModel[] = modelRows
    .filter((row) => internal || (row.client_visible === true && row.status === "active"))
    .map((row) => {
      const id = String(row.id);
      const inputs: ValueInput[] = inputRows
        .filter((input) => input.model_id === id && (internal || input.client_visible === true))
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((input) => ({
          id: String(input.id), key: String(input.input_key), label: String(input.label),
          role: input.role as ValueInput["role"], value: numeric(input.value) ?? Number.NaN,
          unit: String(input.unit), origin: input.origin as ValueInput["origin"],
          sourceDescription: String(input.source_description), evidenceId: text(input.evidence_id),
        }));
      const evidence: ValueEvidence[] = evidenceRows.filter((item) => item.model_id === id && (internal || item.client_visible === true)).map((item) => ({
        id: String(item.id), sourceType: String(item.source_type), sourceReference: String(item.source_reference),
        description: text(item.description), documentUrl: safeEvidenceUrl(item.document_url),
        verificationStatus: item.verification_status as ValueEvidence["verificationStatus"],
      }));
      const verifiedEvidenceIds = new Set(evidence.filter((item) => item.verificationStatus === "verified").map((item) => item.id));
      const snapshots = snapshotRows.filter((snapshot) => snapshot.model_id === id && snapshot.verification_status === "verified" && verifiedEvidenceIds.has(String(snapshot.evidence_id)))
        .map((snapshot) => ({
          id: String(snapshot.id), periodStart: String(snapshot.period_start), periodEnd: String(snapshot.period_end),
          measuredAt: String(snapshot.measured_at), realizedUnits: numeric(snapshot.realized_units) ?? Number.NaN,
          unitValue: numeric(snapshot.unit_value) ?? Number.NaN, unitLabel: String(snapshot.unit_label),
          realizedValue: numeric(snapshot.realized_value) ?? Number.NaN,
          annualizationFactor: numeric(snapshot.annualization_factor), annualizedRunRate: numeric(snapshot.annualized_run_rate),
          annualizationMethod: text(snapshot.annualization_method), evidenceId: String(snapshot.evidence_id),
        }));
      const model: ValueModel = {
        id, initiativeId: text(row.initiative_id), opportunityId: text(row.opportunity_id), metricId: text(row.metric_id),
        name: String(row.name), category: row.category as ValueCategory, formulaKind: row.formula_kind as ValueModel["formulaKind"],
        calculationMethod: String(row.calculation_method), annualizationBasis: String(row.annualization_basis), currencyCode: String(row.currency_code),
        benefitStreamKey: String(row.benefit_stream_key), recoverablePercentage: numeric(row.recoverable_percentage),
        expectedCapturePercentage: numeric(row.expected_capture_percentage), confidence: row.confidence as ValueModel["confidence"],
        confidenceRationale: text(row.confidence_rationale),
        aggregationApproved: row.aggregation_approved_at !== null, inputs, evidence, snapshots, demo: false,
      };
      return calculateValueModel(model);
    });
  return { models, summary: summarizeEconomicImpact(models) };
}

export async function getClientEconomicImpact() { return getEconomicImpact(false); }
export async function getInternalEconomicImpact() { return getEconomicImpact(true); }
