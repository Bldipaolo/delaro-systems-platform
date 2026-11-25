import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoImpactMetrics } from "@/lib/measurement/demo";
import type { EvidenceStatus, ImpactMetric, MeasurementTrustState, MetricObservation } from "@/lib/measurement/types";
import { safeEvidenceUrl } from "@/lib/security/safe-url";

type Row = Record<string, unknown>;
type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type EvidenceRow = {
  id: string; metric_id?: string | null; model_id?: string | null; source_type: string;
  source_reference: string | null; document_url: string | null; description: string | null;
  verification_status: string; client_visible: boolean;
};

export type InternalEvidence = EvidenceRow & { kind: "Metric" | "Value"; subject: string; demo: boolean };

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
function status(value: unknown): EvidenceStatus {
  return value === "submitted" || value === "verified" || value === "rejected" ? value : "pending";
}
function period(start: unknown, end: unknown): string | null {
  const first = text(start);
  const last = text(end);
  return first && last ? `${first} – ${last}` : last ?? first;
}

/** Internal charts expose submitted work for review, while actuals remain derived from verified evidence only. */
export async function getInternalMeasurement(): Promise<{ metrics: ImpactMetric[]; evidence: InternalEvidence[]; demo: boolean }> {
  const context = await requireInternalUserContext();
  if (!context) return { metrics: demoImpactMetrics, evidence: [], demo: true };
  const client = await createClient();
  if (!client) throw new Error("Supabase is unavailable.");
  const organizationId = context.organization.id;
  const [metricRows, baselines, targets, observations, measurementEvidence, valueEvidence, models, people, systems] = await Promise.all([
    rows(client, "measurement_metrics", "id,initiative_id,name,description,unit,improvement_direction,source_system_id,measurement_method,cadence,owner_membership_id,confidence_status,client_visible", organizationId),
    rows(client, "metric_baselines", "id,metric_id,value,period_start,period_end,source_description,evidence_id,verification_status", organizationId),
    rows(client, "metric_targets", "id,metric_id,value,target_date,rationale", organizationId),
    rows(client, "metric_observations", "id,metric_id,measured_value,measured_at,period_start,period_end,source_description,source_reference,sample_size,evidence_id,verification_status,measurement_status,client_visible", organizationId),
    rows(client, "measurement_evidence", "id,metric_id,source_type,source_reference,document_url,description,verification_status,client_visible", organizationId),
    rows(client, "value_evidence", "id,model_id,source_type,source_reference,document_url,description,verification_status,client_visible", organizationId),
    rows(client, "value_models", "id,name", organizationId),
    rows(client, "operational_people", "id,membership_id,display_name", organizationId),
    rows(client, "systems", "id,name", organizationId),
  ]);

  const evidenceById = new Map(measurementEvidence.map((item) => [String(item.id), item]));
  const verifiedEvidenceIds = new Set(measurementEvidence.filter((item) => item.verification_status === "verified").map((item) => String(item.id)));
  const metricNames = new Map(metricRows.map((metric) => [String(metric.id), String(metric.name)]));
  const modelNames = new Map(models.map((model) => [String(model.id), String(model.name)]));

  const metrics = metricRows.map((metric): ImpactMetric => {
    const id = String(metric.id);
    const baselineRows = baselines.filter((item) => item.metric_id === id);
    const baseline = baselineRows.find((item) => item.verification_status === "verified" && verifiedEvidenceIds.has(String(item.evidence_id)));
    const target = targets.find((item) => item.metric_id === id);
    const verifiedObservations = observations
      .filter((item) => item.metric_id === id && item.verification_status === "verified" && verifiedEvidenceIds.has(String(item.evidence_id)))
      .sort((a, b) => String(b.measured_at).localeCompare(String(a.measured_at)));
    const current = verifiedObservations[0];
    const latestObserved = observations.filter((item) => item.metric_id === id && (item.measurement_status === "observed" || item.measurement_status === "verified"))
      .sort((a, b) => String(b.measured_at).localeCompare(String(a.measured_at)))[0];
    const currentEvidence = evidenceById.get(String(current?.evidence_id));
    const metricObservations: MetricObservation[] = observations
      .filter((item) => item.metric_id === id && (item.verification_status === "submitted" || item.verification_status === "verified"))
      .map((item) => {
        const sourceEvidence = evidenceById.get(String(item.evidence_id));
        return {
          id: String(item.id), value: numeric(item.measured_value) ?? Number.NaN,
          measuredAt: String(item.measured_at), periodStart: text(item.period_start), periodEnd: text(item.period_end),
          periodLabel: period(item.period_start, item.period_end), source: text(item.source_description),
          verificationStatus: status(item.verification_status), evidenceStatus: status(sourceEvidence?.verification_status),
          evidenceDescription: text(sourceEvidence?.description) ?? text(sourceEvidence?.source_reference),
          evidenceUrl: safeEvidenceUrl(sourceEvidence?.document_url),
          measurementStatus: (text(item.measurement_status) ?? (item.verification_status === "verified" ? "verified" : "unverified")) as MeasurementTrustState,
          sampleSize: numeric(item.sample_size), sourceReference: text(item.source_reference),
        };
      })
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const owner = people.find((item) => item.membership_id === metric.owner_membership_id);
    const system = systems.find((item) => item.id === metric.source_system_id);
    return {
      id, initiativeId: text(metric.initiative_id), name: String(metric.name), description: text(metric.description),
      unit: String(metric.unit), direction: metric.improvement_direction as ImpactMetric["direction"],
      baselineValue: baseline ? numeric(baseline.value) : null,
      baselinePeriod: baseline ? period(baseline.period_start, baseline.period_end) : null,
      baselineStatus: baseline ? "verified" : status(baselineRows[0]?.verification_status),
      targetValue: target ? numeric(target.value) : null, targetDate: text(target?.target_date),
      currentValue: current ? numeric(current.measured_value) : null,
      latestObservedValue: latestObserved ? numeric(latestObserved.measured_value) : null,
      latestObservedAt: text(latestObserved?.measured_at),
      latestObservedStatus: latestObserved ? (text(latestObserved.measurement_status) as MeasurementTrustState) : null,
      measurementPeriod: latestObserved ? period(latestObserved.period_start, latestObserved.period_end) : null,
      source: text(latestObserved?.source_reference) ?? text(latestObserved?.source_description) ?? text(system?.name) ?? text(baseline?.source_description),
      measurementMethod: text(metric.measurement_method), cadence: text(metric.cadence),
      evidenceConfidence: metric.confidence_status as ImpactMetric["evidenceConfidence"],
      evidenceDescription: text(currentEvidence?.description) ?? text(currentEvidence?.source_reference),
      evidenceUrl: safeEvidenceUrl(currentEvidence?.document_url), lastMeasuredAt: text(current?.measured_at),
      ownerName: text(owner?.display_name), observations: metricObservations, demo: false,
    };
  });

  const evidence: InternalEvidence[] = [
    ...(measurementEvidence as unknown as EvidenceRow[]).map((item) => ({ ...item, kind: "Metric" as const, subject: metricNames.get(item.metric_id ?? "") ?? "Unknown metric", demo: false })),
    ...(valueEvidence as unknown as EvidenceRow[]).map((item) => ({ ...item, kind: "Value" as const, subject: modelNames.get(item.model_id ?? "") ?? "Unknown value model", demo: false })),
  ];
  return { metrics, evidence, demo: false };
}
