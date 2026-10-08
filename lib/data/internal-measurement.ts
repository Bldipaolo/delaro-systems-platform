import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoImpactMetrics } from "@/lib/measurement/demo";

type MetricRow = {
  id: string; name: string; unit: string; confidence_status: string; measurement_method: string | null;
};
type EvidenceRow = {
  id: string; metric_id?: string | null; model_id?: string | null; source_type: string;
  source_reference: string | null; document_url: string | null; description: string | null;
  verification_status: string; client_visible: boolean;
};

export type InternalMetric = {
  id: string; name: string; unit: string; baseline: number | null; target: number | null;
  latestObservation: number | null; observedAt: string | null; observationStatus: string;
  confidence: string; method: string | null; demo: boolean;
};
export type InternalEvidence = EvidenceRow & { kind: "Metric" | "Value"; subject: string; demo: boolean };

export async function getInternalMeasurement(): Promise<{ metrics: InternalMetric[]; evidence: InternalEvidence[]; demo: boolean }> {
  const context = await requireInternalUserContext();
  if (!context) return {
    metrics: demoImpactMetrics.map((metric) => ({ id: metric.id, name: metric.name, unit: metric.unit,
      baseline: metric.baselineValue, target: metric.targetValue, latestObservation: null, observedAt: null,
      observationStatus: "pending", confidence: metric.evidenceConfidence, method: metric.measurementMethod, demo: true })),
    evidence: [], demo: true,
  };
  const client = await createClient();
  if (!client) throw new Error("Supabase is unavailable.");
  const organizationId = context.organization.id;
  const [metricsResult, baselineResult, targetResult, observationResult, measurementEvidenceResult, valueEvidenceResult, modelsResult] = await Promise.all([
    client.from("measurement_metrics").select("id,name,unit,confidence_status,measurement_method").eq("organization_id", organizationId),
    client.from("metric_baselines").select("metric_id,value,verification_status").eq("organization_id", organizationId),
    client.from("metric_targets").select("metric_id,value").eq("organization_id", organizationId),
    client.from("metric_observations").select("metric_id,measured_value,measured_at,verification_status").eq("organization_id", organizationId).order("measured_at", { ascending: false }),
    client.from("measurement_evidence").select("id,metric_id,source_type,source_reference,document_url,description,verification_status,client_visible").eq("organization_id", organizationId),
    client.from("value_evidence").select("id,model_id,source_type,source_reference,document_url,description,verification_status,client_visible").eq("organization_id", organizationId),
    client.from("value_models").select("id,name").eq("organization_id", organizationId),
  ]);
  const failure = [metricsResult, baselineResult, targetResult, observationResult, measurementEvidenceResult, valueEvidenceResult, modelsResult].find((result) => result.error);
  if (failure?.error) throw new Error(`Unable to load internal measurement: ${failure.error.message}`);
  const metricRows = (metricsResult.data ?? []) as MetricRow[];
  const metricNames = new Map(metricRows.map((metric) => [metric.id, metric.name]));
  const modelNames = new Map((modelsResult.data ?? []).map((model) => [model.id, model.name]));
  const metrics = metricRows.map((metric): InternalMetric => {
    const baseline = (baselineResult.data ?? []).find((row) => row.metric_id === metric.id);
    const target = (targetResult.data ?? []).find((row) => row.metric_id === metric.id);
    const observation = (observationResult.data ?? []).find((row) => row.metric_id === metric.id);
    return { id: metric.id, name: metric.name, unit: metric.unit,
      baseline: baseline ? Number(baseline.value) : null, target: target ? Number(target.value) : null,
      latestObservation: observation ? Number(observation.measured_value) : null,
      observedAt: observation?.measured_at ?? null, observationStatus: observation?.verification_status ?? "pending",
      confidence: metric.confidence_status, method: metric.measurement_method, demo: false };
  });
  const evidence: InternalEvidence[] = [
    ...((measurementEvidenceResult.data ?? []) as EvidenceRow[]).map((item) => ({ ...item, kind: "Metric" as const, subject: metricNames.get(item.metric_id ?? "") ?? "Unknown metric", demo: false })),
    ...((valueEvidenceResult.data ?? []) as EvidenceRow[]).map((item) => ({ ...item, kind: "Value" as const, subject: modelNames.get(item.model_id ?? "") ?? "Unknown value model", demo: false })),
  ];
  return { metrics, evidence, demo: false };
}
