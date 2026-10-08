import { requireCurrentUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoImpactMetrics } from "@/lib/measurement/demo";
import type { ImpactMetric } from "@/lib/measurement/types";

type Row = Record<string, unknown>;
type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

async function rows(client: Client, table: string, selection: string, organizationId: string): Promise<Row[]> {
  const { data, error } = await client.from(table).select(selection).eq("organization_id", organizationId);
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function period(start: unknown, end: unknown): string | null {
  const first = textValue(start);
  const last = textValue(end);
  return first && last ? `${first} – ${last}` : last ?? first;
}

/** Client Impact data. RLS and this mapper both require verified evidence before exposing actuals. */
export async function getClientImpact(): Promise<ImpactMetric[]> {
  const context = await requireCurrentUserContext();
  if (!context) return demoImpactMetrics;
  const client = await createClient();
  if (!client) throw new Error("Supabase is not configured.");
  const organizationId = context.organization.id;
  const [metrics, baselines, targets, observations, evidence, people, systems] = await Promise.all([
    rows(client, "measurement_metrics", "id,organization_id,initiative_id,process_id,process_step_id,name,description,unit,improvement_direction,source_system_id,measurement_method,cadence,owner_membership_id,confidence_status,client_visible", organizationId),
    rows(client, "metric_baselines", "id,organization_id,metric_id,value,period_start,period_end,source_description,evidence_id,verification_status", organizationId),
    rows(client, "metric_targets", "id,organization_id,metric_id,value,target_date,rationale", organizationId),
    rows(client, "metric_observations", "id,organization_id,metric_id,measured_value,measured_at,period_start,period_end,source_description,evidence_id,verification_status", organizationId),
    rows(client, "measurement_evidence", "id,organization_id,metric_id,source_type,source_reference,document_url,description,verification_status,client_visible", organizationId),
    rows(client, "operational_people", "id,organization_id,membership_id,display_name,client_visible", organizationId),
    rows(client, "systems", "id,organization_id,name,client_visible", organizationId),
  ]);
  const verifiedEvidence = new Map(evidence.filter((item) => item.verification_status === "verified" && item.client_visible === true).map((item) => [item.id, item]));

  return metrics.filter((metric) => metric.client_visible === true).map((metric) => {
    const id = String(metric.id);
    const baseline = baselines.find((row) => row.metric_id === id && row.verification_status === "verified" && verifiedEvidence.has(row.evidence_id));
    const target = targets.find((row) => row.metric_id === id);
    const current = observations
      .filter((row) => row.metric_id === id && row.verification_status === "verified" && verifiedEvidence.has(row.evidence_id))
      .sort((a, b) => String(b.measured_at).localeCompare(String(a.measured_at)))[0];
    const currentEvidence = verifiedEvidence.get(current?.evidence_id);
    const owner = people.find((person) => person.membership_id === metric.owner_membership_id && person.client_visible === true);
    const system = systems.find((item) => item.id === metric.source_system_id && item.client_visible === true);
    return {
      id, initiativeId: textValue(metric.initiative_id), name: String(metric.name), description: textValue(metric.description),
      unit: String(metric.unit), direction: metric.improvement_direction as ImpactMetric["direction"],
      baselineValue: baseline ? numberValue(baseline.value) : null,
      baselinePeriod: baseline ? period(baseline.period_start, baseline.period_end) : null,
      baselineStatus: baseline ? "verified" : "pending",
      targetValue: target ? numberValue(target.value) : null, targetDate: textValue(target?.target_date),
      currentValue: current ? numberValue(current.measured_value) : null,
      measurementPeriod: current ? period(current.period_start, current.period_end) : null,
      source: textValue(current?.source_description) ?? textValue(system?.name) ?? textValue(baseline?.source_description),
      measurementMethod: textValue(metric.measurement_method), cadence: textValue(metric.cadence),
      evidenceConfidence: metric.confidence_status as ImpactMetric["evidenceConfidence"],
      evidenceDescription: textValue(currentEvidence?.description) ?? textValue(currentEvidence?.source_reference),
      evidenceUrl: textValue(currentEvidence?.document_url), lastMeasuredAt: textValue(current?.measured_at),
      ownerName: textValue(owner?.display_name), demo: false,
    };
  });
}
