import { requireInternalUserContext } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { MeasurementProvider, MeasurementSourceStatus } from "@/lib/measurement-sources/types";

type Row = Record<string, unknown>;

export type InternalSourceMapping = {
  id: string; metricId: string; metricName: string; name: string; providerObject: string;
  valueField: string; transformKind: string; aggregationMethod: string; periodGranularity: string;
  status: string; clientVisible: boolean;
};

export type InternalSyncRun = {
  id: string; status: string; triggerType: string; attempt: number; recordsSeen: number;
  recordsAccepted: number; recordsFailed: number; errorSummary: string | null;
  startedAt: string | null; finishedAt: string | null; createdAt: string;
};

export type InternalMeasurementSource = {
  id: string; name: string; description: string | null; providerType: MeasurementProvider;
  connectionMode: string; externalReference: string | null; status: MeasurementSourceStatus;
  clientVisible: boolean; scheduleEnabled: boolean; scheduleIntervalMinutes: number;
  staleAfterMinutes: number; nextSyncAt: string | null; lastSuccessfulAt: string | null;
  lastFailedAt: string | null; lastRecordAt: string | null; consecutiveFailures: number;
  healthSummary: string | null; workflowId: string | null; mappings: InternalSourceMapping[];
  runs: InternalSyncRun[]; demo: boolean;
};

export type InternalMeasurementSourceWorkspace = {
  organizationId: string; organizationName: string; organizations: { id: string; name: string }[];
  sources: InternalMeasurementSource[]; metrics: { id: string; name: string; unit: string }[];
  demo: boolean;
};

function text(value: unknown) { return typeof value === "string" ? value : null; }

function demoWorkspace(): InternalMeasurementSourceWorkspace {
  return {
    organizationId: "demo-northstar", organizationName: "Northstar Manufacturing",
    organizations: [{ id: "demo-northstar", name: "Northstar Manufacturing" }], demo: true,
    metrics: [{ id: "demo-response", name: "Lead response time", unit: "minutes" }],
    sources: [{
      id: "demo-hubspot", name: "HubSpot sales operations", description: "Illustrative CRM measurement source.",
      providerType: "hubspot", connectionMode: "pull", externalReference: "Demo portal", status: "healthy",
      clientVisible: true, scheduleEnabled: true, scheduleIntervalMinutes: 60, staleAfterMinutes: 1440,
      nextSyncAt: new Date(Date.now() + 38 * 60_000).toISOString(), lastSuccessfulAt: new Date(Date.now() - 22 * 60_000).toISOString(),
      lastFailedAt: null, lastRecordAt: new Date(Date.now() - 22 * 60_000).toISOString(), consecutiveFailures: 0,
      healthSummary: "Latest measurement received", workflowId: null, demo: true,
      mappings: [{ id: "demo-map", metricId: "demo-response", metricName: "Lead response time", name: "CRM response duration", providerObject: "contacts", valueField: "properties.response_minutes", transformKind: "identity", aggregationMethod: "average", periodGranularity: "day", status: "active", clientVisible: true }],
      runs: [{ id: "demo-run", status: "succeeded", triggerType: "scheduled", attempt: 1, recordsSeen: 42, recordsAccepted: 1, recordsFailed: 0, errorSummary: null, startedAt: new Date(Date.now() - 23 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 22 * 60_000).toISOString(), createdAt: new Date(Date.now() - 23 * 60_000).toISOString() }],
    }],
  };
}

export async function getInternalMeasurementSources(requestedOrganizationId?: string): Promise<InternalMeasurementSourceWorkspace> {
  const context = await requireInternalUserContext();
  if (!context) return demoWorkspace();
  const client = await createClient();
  if (!client) throw new Error("Measurement source management is unavailable.");
  const internalOrganizationIds = new Set(context.memberships.filter((item) => canViewInternalWorkspace(item.role)).map((item) => item.organizationId));
  const organizations = context.organizations.filter((item) => internalOrganizationIds.has(item.id)).map((item) => ({ id: item.id, name: item.name }));
  const selected = organizations.find((item) => item.id === requestedOrganizationId)
    ?? organizations.find((item) => item.id === context.organization.id) ?? organizations[0];
  if (!selected) throw new Error("No internal client organization is available.");
  const organizationId = selected.id;
  const [sourceResult, mappingResult, runResult, metricResult] = await Promise.all([
    client.from("measurement_sources").select("id,name,description,provider_type,connection_mode,external_reference,status,client_visible,schedule_enabled,schedule_interval_minutes,stale_after_minutes,next_sync_at,last_successful_at,last_failed_at,last_record_at,consecutive_failures,health_summary,workflow_id").eq("organization_id", organizationId).order("name"),
    client.from("measurement_source_mappings").select("id,source_id,metric_id,name,provider_object,value_field,transform_kind,aggregation_method,period_granularity,status,client_visible").eq("organization_id", organizationId).order("name"),
    client.from("measurement_sync_runs").select("id,source_id,status,trigger_type,attempt,records_seen,records_accepted,records_failed,error_summary,started_at,finished_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
    client.from("measurement_metrics").select("id,name,unit").eq("organization_id", organizationId).eq("status", "active").order("name"),
  ]);
  for (const result of [sourceResult,mappingResult,runResult,metricResult]) if (result.error) throw new Error(`Unable to load measurement sources: ${result.error.message}`);
  const metrics = (metricResult.data ?? []).map((item) => ({ id: item.id, name: item.name, unit: item.unit }));
  const metricNames = new Map(metrics.map((item) => [item.id,item.name]));
  const mappings = (mappingResult.data ?? []) as unknown as Row[];
  const runs = (runResult.data ?? []) as unknown as Row[];
  return {
    organizationId, organizationName: selected.name, organizations, metrics, demo: false,
    sources: ((sourceResult.data ?? []) as unknown as Row[]).map((row): InternalMeasurementSource => ({
      id: String(row.id), name: String(row.name), description: text(row.description), providerType: row.provider_type as MeasurementProvider,
      connectionMode: String(row.connection_mode), externalReference: text(row.external_reference), status: row.status as MeasurementSourceStatus,
      clientVisible: row.client_visible === true, scheduleEnabled: row.schedule_enabled === true,
      scheduleIntervalMinutes: Number(row.schedule_interval_minutes), staleAfterMinutes: Number(row.stale_after_minutes),
      nextSyncAt: text(row.next_sync_at), lastSuccessfulAt: text(row.last_successful_at), lastFailedAt: text(row.last_failed_at),
      lastRecordAt: text(row.last_record_at), consecutiveFailures: Number(row.consecutive_failures ?? 0), healthSummary: text(row.health_summary),
      workflowId: text(row.workflow_id), demo: false,
      mappings: mappings.filter((item) => item.source_id === row.id).map((item) => ({
        id: String(item.id), metricId: String(item.metric_id), metricName: metricNames.get(String(item.metric_id)) ?? "Unknown measure",
        name: String(item.name), providerObject: String(item.provider_object), valueField: String(item.value_field),
        transformKind: String(item.transform_kind), aggregationMethod: String(item.aggregation_method), periodGranularity: String(item.period_granularity),
        status: String(item.status), clientVisible: item.client_visible === true,
      })),
      runs: runs.filter((item) => item.source_id === row.id).slice(0, 8).map((item) => ({
        id: String(item.id), status: String(item.status), triggerType: String(item.trigger_type), attempt: Number(item.attempt),
        recordsSeen: Number(item.records_seen), recordsAccepted: Number(item.records_accepted), recordsFailed: Number(item.records_failed),
        errorSummary: text(item.error_summary), startedAt: text(item.started_at), finishedAt: text(item.finished_at), createdAt: String(item.created_at),
      })),
    })),
  };
}
