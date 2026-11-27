import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { requireCurrentUserContext, requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoOperationalSignals } from "@/lib/operational-intelligence/demo";
import type { InternalSignalWorkspace, OperationalSignalView, SignalFilters } from "@/lib/operational-intelligence/view-types";
import type { SignalSeverity, SignalStatus } from "@/lib/operational-intelligence/types";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/series";
import { z } from "zod";

type SignalRow = {
  id: string; organization_id: string; rule_id: string | null; title: string; business_summary: string;
  signal_type: string; entity_type: "metric" | "workflow" | "measurement_source"; severity: SignalSeverity;
  confidence: "low" | "medium" | "high"; status: SignalStatus; visibility_status: "internal_only" | "reviewed" | "client_visible";
  current_value: unknown; reference_value: unknown; percentage_deviation: unknown; unit: string | null;
  current_sample_size: number; reference_sample_size: number; consecutive_periods: number;
  current_window_start: string | null; current_window_end: string; reference_window_start: string | null; reference_window_end: string | null;
  first_detected_at: string; last_observed_at: string; detection_method: string;
  process_id: string | null; operational_area_id: string | null; workflow_id: string | null;
  metric_id: string | null; measurement_source_id: string | null; evidence_summary: Record<string, unknown> | null;
  economic_context: OperationalSignalView["economicContext"] | null;
};

const signalSelect = "id,organization_id,rule_id,title,business_summary,signal_type,entity_type,severity,confidence,status,visibility_status,current_value,reference_value,percentage_deviation,unit,current_sample_size,reference_sample_size,consecutive_periods,current_window_start,current_window_end,reference_window_start,reference_window_end,first_detected_at,last_observed_at,detection_method,process_id,operational_area_id,workflow_id,metric_id,measurement_source_id,evidence_summary,economic_context";

function numberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function hydrateSignals(rows: SignalRow[], organizationNames: Map<string, string>, internal: boolean) {
  const client = await createClient();
  if (!client || !rows.length) return [];
  const signalIds = rows.map((row) => row.id);
  const processIds = rows.flatMap((row) => row.process_id ? [row.process_id] : []);
  const areaIds = rows.flatMap((row) => row.operational_area_id ? [row.operational_area_id] : []);
  const workflowIds = rows.flatMap((row) => row.workflow_id ? [row.workflow_id] : []);
  const metricIds = rows.flatMap((row) => row.metric_id ? [row.metric_id] : []);
  const sourceIds = rows.flatMap((row) => row.measurement_source_id ? [row.measurement_source_id] : []);
  const ruleIds = internal ? rows.flatMap((row) => row.rule_id ? [row.rule_id] : []) : [];
  const [eventsResult, processesResult, areasResult, workflowsResult, metricsResult, sourcesResult, detailsResult, rulesResult] = await Promise.all([
    client.from("operational_signal_events").select("id,signal_id,event_type,summary,occurred_at").in("signal_id", signalIds).order("occurred_at", { ascending: false }),
    processIds.length ? client.from("processes").select("id,name").in("id", processIds) : Promise.resolve({ data: [], error: null }),
    areaIds.length ? client.from("operational_areas").select("id,name").in("id", areaIds) : Promise.resolve({ data: [], error: null }),
    workflowIds.length ? client.from("implementation_workflows").select("id,workflow_name").in("id", workflowIds) : Promise.resolve({ data: [], error: null }),
    metricIds.length ? client.from("measurement_metrics").select("id,name").in("id", metricIds) : Promise.resolve({ data: [], error: null }),
    sourceIds.length ? client.from("measurement_sources").select("id,name").in("id", sourceIds) : Promise.resolve({ data: [], error: null }),
    internal ? client.from("operational_signal_internal_details").select("signal_id,internal_notes").in("signal_id", signalIds) : Promise.resolve({ data: [], error: null }),
    ruleIds.length ? client.from("operational_signal_rules").select("id,current_window_minutes,reference_window_minutes,minimum_current_samples,minimum_reference_samples,minimum_consecutive_periods,deviation_threshold_pct,client_publication_mode").in("id", ruleIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = [eventsResult, processesResult, areasResult, workflowsResult, metricsResult, sourcesResult, detailsResult, rulesResult].find((result) => result.error)?.error;
  if (error) throw new Error("Unable to load signal evidence and relationships.");
  const namedRows = (items: unknown) => (items ?? []) as Array<{ id: string; name: string }>;
  const processes = new Map(namedRows(processesResult.data).map((item) => [item.id, item]));
  const areas = new Map(namedRows(areasResult.data).map((item) => [item.id, item]));
  const workflows = new Map(((workflowsResult.data ?? []) as Array<{ id: string; workflow_name: string }>).map((item) => [item.id, item]));
  const metrics = new Map(namedRows(metricsResult.data).map((item) => [item.id, item]));
  const sources = new Map(namedRows(sourcesResult.data).map((item) => [item.id, item]));
  const rules = new Map(((rulesResult.data ?? []) as Array<{ id: string; current_window_minutes: number | null; reference_window_minutes: number | null; minimum_current_samples: number; minimum_reference_samples: number; minimum_consecutive_periods: number; deviation_threshold_pct: unknown; client_publication_mode: "internal_only" | "review_required" | "auto_publish" }>).map((item) => [item.id, item]));
  const details = new Map((detailsResult.data ?? []).map((item) => [item.signal_id, item]));
  return rows.map((row): OperationalSignalView => {
    const rule = row.rule_id ? rules.get(row.rule_id) : null;
    return {
      id: row.id, organizationId: row.organization_id, organizationName: organizationNames.get(row.organization_id) ?? "Client organization",
      ruleId: row.rule_id, title: row.title, summary: row.business_summary, signalType: row.signal_type, entityType: row.entity_type,
      severity: row.severity, confidence: row.confidence, status: row.status, visibility: row.visibility_status,
      currentValue: numberOrNull(row.current_value), referenceValue: numberOrNull(row.reference_value), percentageDeviation: numberOrNull(row.percentage_deviation), unit: row.unit,
      currentSampleSize: row.current_sample_size, referenceSampleSize: row.reference_sample_size, consecutivePeriods: row.consecutive_periods,
      currentWindowStart: row.current_window_start, currentWindowEnd: row.current_window_end, referenceWindowStart: row.reference_window_start,
      referenceWindowEnd: row.reference_window_end, firstDetectedAt: row.first_detected_at, lastObservedAt: row.last_observed_at,
      detectionMethod: row.detection_method, processId: row.process_id, processName: row.process_id ? processes.get(row.process_id)?.name ?? null : null,
      operationalAreaId: row.operational_area_id, operationalAreaName: row.operational_area_id ? areas.get(row.operational_area_id)?.name ?? null : null,
      workflowId: row.workflow_id, workflowName: row.workflow_id ? workflows.get(row.workflow_id)?.workflow_name ?? null : null,
      metricId: row.metric_id, metricName: row.metric_id ? metrics.get(row.metric_id)?.name ?? null : null,
      sourceId: row.measurement_source_id, sourceName: row.measurement_source_id ? sources.get(row.measurement_source_id)?.name ?? null : null,
      evidence: row.evidence_summary ?? {}, events: (eventsResult.data ?? []).filter((event) => event.signal_id === row.id).map((event) => ({
        id: event.id, type: event.event_type, summary: event.summary, occurredAt: event.occurred_at,
      })),
      economicContext: row.economic_context ?? {},
      ...(internal ? {
        internalNotes: details.get(row.id)?.internal_notes ?? null,
        rule: rule ? { currentWindowMinutes: rule.current_window_minutes, referenceWindowMinutes: rule.reference_window_minutes,
          minimumCurrentSamples: rule.minimum_current_samples, minimumReferenceSamples: rule.minimum_reference_samples,
          minimumConsecutivePeriods: rule.minimum_consecutive_periods, deviationThresholdPct: numberOrNull(rule.deviation_threshold_pct),
          publicationMode: rule.client_publication_mode } : null,
      } : {}),
    };
  });
}

export async function getInternalOperationalSignals(filters: SignalFilters = {}): Promise<InternalSignalWorkspace> {
  const context = await requireInternalUserContext();
  if (!context) return { signals: demoOperationalSignals, organizations: [{ id: "demo-northstar", name: "Northstar Manufacturing" }], selectedOrganizationId: "demo-northstar" };
  const allowedMemberships = context.memberships.filter((membership) => canViewInternalWorkspace(membership.role));
  const allowedIds = new Set(allowedMemberships.map((membership) => membership.organizationId));
  const selectedOrganizationId = filters.organizationId && allowedIds.has(filters.organizationId) ? filters.organizationId : context.organization.id;
  if (!allowedIds.has(selectedOrganizationId)) throw new Error("Internal organization access required.");
  const organizations = context.organizations.filter((organization) => allowedIds.has(organization.id)).map(({ id, name }) => ({ id, name }));
  const client = await createClient();
  if (!client) throw new Error("The intelligence workspace is unavailable.");
  const cutoff = new Date(Date.now() - Number(filters.period ?? "30") * 86_400_000).toISOString();
  let query = client.from("operational_signals").select(signalSelect)
    .eq("organization_id", selectedOrganizationId).gte("last_observed_at", cutoff).order("last_observed_at", { ascending: false }).limit(250);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.type) query = query.eq("signal_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.areaId) query = query.eq("operational_area_id", filters.areaId);
  if (filters.workflowId) query = query.eq("workflow_id", filters.workflowId);
  if (filters.metricId) query = query.eq("metric_id", filters.metricId);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load operational signals.");
  const names = new Map(context.organizations.map((organization) => [organization.id, organization.name]));
  return { signals: await hydrateSignals((data ?? []) as SignalRow[], names, true), organizations, selectedOrganizationId };
}

export async function getClientOperationalSignals(options: { includeResolved?: boolean; limit?: number } = {}) {
  const context = await requireCurrentUserContext();
  if (!context) return demoOperationalSignals.filter((signal) => options.includeResolved || signal.status !== "resolved").slice(0, options.limit);
  const client = await createClient();
  if (!client) throw new Error("Operational attention is unavailable.");
  let query = client.from("operational_signals").select(signalSelect)
    .eq("organization_id", context.organization.id).eq("visibility_status", "client_visible").order("last_observed_at", { ascending: false });
  if (!options.includeResolved) query = query.in("status", ["active", "monitoring", "acknowledged"]);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load operational attention.");
  return hydrateSignals((data ?? []) as SignalRow[], new Map([[context.organization.id, context.organization.name]]), false);
}

export async function getClientOperationalSignal(signalId: string) {
  const context = await requireCurrentUserContext();
  if (!context) return demoOperationalSignals.find((signal) => signal.id === signalId) ?? null;
  if (!z.string().uuid().safeParse(signalId).success) return null;
  const client = await createClient();
  if (!client) throw new Error("Operational attention is unavailable.");
  const { data, error } = await client.from("operational_signals").select(signalSelect)
    .eq("organization_id", context.organization.id).eq("id", signalId).eq("visibility_status", "client_visible").maybeSingle();
  if (error) throw new Error("Unable to load this operational signal.");
  if (!data) return null;
  const hydrated = await hydrateSignals([data as SignalRow], new Map([[context.organization.id, context.organization.name]]), false);
  return hydrated[0] ?? null;
}

export async function getClientOperationalSignalDetail(signalId: string): Promise<{ signal: OperationalSignalView; history: AnalyticsSeriesPoint[] } | null> {
  if (!z.string().uuid().safeParse(signalId).success && !signalId.startsWith("demo-")) return null;
  const signal = await getClientOperationalSignal(signalId);
  if (!signal) return null;
  if (!signal.metricId || signal.demo) return { signal, history: [] };
  const client = await createClient();
  if (!client) return { signal, history: [] };
  const { data, error } = await client.from("metric_observations")
    .select("id,measured_value,measured_at,period_end,verification_status,measurement_status")
    .eq("organization_id", signal.organizationId).eq("metric_id", signal.metricId)
    .order("measured_at", { ascending: true }).limit(180);
  if (error) throw new Error("Unable to load signal measurement history.");
  const history: AnalyticsSeriesPoint[] = (data ?? []).flatMap((row) => {
    const value = numberOrNull(row.measured_value);
    if (value === null) return [];
    const status = row.measurement_status === "observed" ? "observed"
      : row.verification_status === "verified" ? "verified" : "submitted";
    return [{ id: row.id, date: row.period_end ?? row.measured_at, label: row.period_end ?? row.measured_at, value, status }];
  });
  return { signal, history };
}
