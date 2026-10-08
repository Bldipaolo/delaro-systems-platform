import { requireCurrentUserContext, requireInternalUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoInternalEvents, demoOperationalActivity } from "@/lib/operational-events/demo";
import type { EventSeverity, EventStatus, ExceptionStatus, InternalOperationalEvent, OperationalActivity, OperationalEvent, OperationalException } from "@/lib/operational-events/types";

type DatabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const eventFields = "id,organization_id,system_id,initiative_id,process_id,decision_id,event_type,severity,summary,status,source,occurred_at";
const exceptionFields = "id,organization_id,event_id,decision_id,title,client_summary,status";

async function loadActivity(supabase: DatabaseClient, organizationId: string, internal: boolean): Promise<OperationalActivity> {
  let eventQuery = supabase.from("system_events").select(eventFields).eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false }).limit(internal ? 100 : 50);
  let exceptionQuery = supabase.from("exceptions").select(exceptionFields).eq("organization_id", organizationId)
    .in("status", ["open", "investigating", "awaiting_client"]).order("created_at", { ascending: false }).limit(30);
  if (!internal) {
    eventQuery = eventQuery.eq("client_visible", true);
    exceptionQuery = exceptionQuery.eq("client_visible", true);
  }
  const [eventResult, exceptionResult] = await Promise.all([eventQuery, exceptionQuery]);
  if (eventResult.error) throw new Error(`Unable to load operational events: ${eventResult.error.message}`);
  if (exceptionResult.error) throw new Error(`Unable to load operational exceptions: ${exceptionResult.error.message}`);
  const recentRows = eventResult.data ?? [];
  const exceptionRows = exceptionResult.data ?? [];
  const knownIds = new Set(recentRows.map((row) => row.id));
  const missingIds = [...new Set(exceptionRows.map((row) => row.event_id).filter((id) => !knownIds.has(id)))];
  const { data: olderRows, error: olderError } = missingIds.length
    ? await supabase.from("system_events").select(eventFields).eq("organization_id", organizationId)
      .in("id", missingIds).limit(30)
    : { data: [], error: null };
  if (olderError) throw new Error(`Unable to load exception events: ${olderError.message}`);
  const allRows = [...recentRows, ...(olderRows ?? [])];
  const systemIds = [...new Set(allRows.map((row) => row.system_id).filter((id): id is string => Boolean(id)))];
  const decisionIds = [...new Set(allRows.map((row) => row.decision_id).concat(exceptionRows.map((row) => row.decision_id)).filter((id): id is string => Boolean(id)))];
  const [systemResult, decisionResult] = await Promise.all([
    systemIds.length ? supabase.from("systems").select("id,name").eq("organization_id", organizationId).in("id", systemIds) : Promise.resolve({ data: [], error: null }),
    decisionIds.length ? supabase.from("decisions").select("id").eq("organization_id", organizationId).in("id", decisionIds).eq("client_visible", true) : Promise.resolve({ data: [], error: null }),
  ]);
  if (systemResult.error) throw new Error(`Unable to load event systems: ${systemResult.error.message}`);
  if (decisionResult.error) throw new Error(`Unable to load related decisions: ${decisionResult.error.message}`);
  const names = new Map((systemResult.data ?? []).map((system) => [system.id, system.name]));
  const visibleDecisionIds = new Set((decisionResult.data ?? []).map((decision) => decision.id));
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const toEvent = (row: (typeof allRows)[number]): OperationalEvent => ({
    id: row.id, eventType: row.event_type, severity: row.severity as EventSeverity,
    summary: row.summary, status: row.status as EventStatus, source: row.source,
    occurredAt: row.occurred_at, systemName: row.system_id ? names.get(row.system_id) ?? null : null,
    initiativeId: row.initiative_id, processId: row.process_id,
    decisionId: row.decision_id && visibleDecisionIds.has(row.decision_id) ? row.decision_id : null,
  });
  const exceptions: OperationalException[] = exceptionRows.flatMap((row) => {
    const event = byId.get(row.event_id);
    if (!event) return []; // An unpublished event must never surface through its exception.
    return [{ id: row.id, eventId: row.event_id, title: row.title, summary: row.client_summary,
      status: row.status as ExceptionStatus, severity: event.severity as EventSeverity,
      occurredAt: event.occurred_at,
      decisionId: row.decision_id && visibleDecisionIds.has(row.decision_id) ? row.decision_id : null }];
  });
  return { events: recentRows.map(toEvent), exceptions, demo: false };
}

export async function getClientOperationalActivity(): Promise<OperationalActivity> {
  if (!isSupabaseConfigured()) return demoOperationalActivity;
  const context = await requireCurrentUserContext();
  if (!context) return { events: [], exceptions: [], demo: false };
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is unavailable.");
  return loadActivity(supabase, context.organization.id, false);
}

export async function getInternalOperationalActivity(): Promise<OperationalActivity & { technicalEvents: InternalOperationalEvent[] }> {
  if (!isSupabaseConfigured()) return { ...demoOperationalActivity, technicalEvents: demoInternalEvents };
  const context = await requireInternalUserContext();
  if (!context) return { events: [], exceptions: [], technicalEvents: [], demo: false };
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is unavailable.");
  const activity = await loadActivity(supabase, context.organization.id, true);
  const ids = activity.events.map((event) => event.id);
  const { data: diagnostics, error } = ids.length
    ? await supabase.from("system_event_diagnostics").select("event_id,source_reference,technical_details,metadata")
      .eq("organization_id", context.organization.id).in("event_id", ids)
    : { data: [], error: null };
  if (error) throw new Error(`Unable to load event diagnostics: ${error.message}`);
  const byEvent = new Map((diagnostics ?? []).map((detail) => [detail.event_id, detail]));
  return { ...activity, technicalEvents: activity.events.map((event) => {
    const detail = byEvent.get(event.id);
    return { ...event, sourceReference: detail?.source_reference ?? null,
      technicalDetails: detail?.technical_details ?? null,
      metadata: detail?.metadata && typeof detail.metadata === "object" && !Array.isArray(detail.metadata)
        ? detail.metadata as Record<string, unknown> : {} };
  }) };
}
