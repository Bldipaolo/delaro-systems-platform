import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateMetricDeviation,
  evaluateSourceHealth,
  evaluateTargetBreach,
  evaluateWorkflowDuration,
  evaluateWorkflowFailureRate,
  operationalSignalIdentity,
  transitionSignal,
} from "@/lib/operational-intelligence/detection";
import type {
  DetectionResult,
  ImprovementDirection,
  NumericPoint,
  SignalOutcome,
  SignalSeverity,
  SignalStatus,
  SourceHealth,
  WindowRule,
  WorkflowExecutionPoint,
} from "@/lib/operational-intelligence/types";

type SignalType =
  | "workflow_failure_rate"
  | "workflow_duration"
  | "metric_deterioration"
  | "metric_target_breach"
  | "source_degraded";

type EntityType = "metric" | "workflow" | "measurement_source";

type StoredRule = {
  id: string;
  organization_id: string;
  name: string;
  signal_type: SignalType;
  entity_type: EntityType;
  metric_id: string | null;
  workflow_id: string | null;
  measurement_source_id: string | null;
  detection_method: string;
  current_window_minutes: number | null;
  reference_window_minutes: number | null;
  minimum_current_samples: number;
  minimum_reference_samples: number;
  minimum_consecutive_periods: number;
  deviation_threshold_pct: number | null;
  recovery_threshold_pct: number | null;
  importance: 1 | 2 | 3 | 4 | 5;
  client_publication_mode: "internal_only" | "review_required" | "auto_publish";
  status: "active" | "disabled";
};

type ExistingSignal = {
  id: string;
  status: SignalStatus;
  first_detected_at: string;
  visibility_status: "internal_only" | "reviewed" | "client_visible";
  publication_reason: "analyst_review" | "automatic_infrastructure" | null;
  reviewed_by_membership_id: string | null;
  reviewed_at: string | null;
  evidence_summary: Record<string, unknown> | null;
};

type EntityContext = {
  organizationId: string;
  entityId: string;
  entityType: EntityType;
  metricId?: string | null;
  workflowId?: string | null;
  measurementSourceId?: string | null;
  processId?: string | null;
  operationalAreaId?: string | null;
  name: string;
  unit?: string | null;
};

const ruleSelect = "id,organization_id,name,signal_type,entity_type,metric_id,workflow_id,measurement_source_id,detection_method,current_window_minutes,reference_window_minutes,minimum_current_samples,minimum_reference_samples,minimum_consecutive_periods,deviation_threshold_pct,recovery_threshold_pct,importance,client_publication_mode,status";

function toRule(rule: StoredRule): WindowRule {
  return {
    currentWindowMinutes: rule.current_window_minutes ?? 4_320,
    referenceWindowMinutes: rule.reference_window_minutes ?? 43_200,
    minimumCurrentSamples: rule.minimum_current_samples,
    minimumReferenceSamples: rule.minimum_reference_samples,
    minimumConsecutivePeriods: rule.minimum_consecutive_periods,
    deviationThresholdPct: rule.deviation_threshold_pct ?? 30,
    recoveryThresholdPct: rule.recovery_threshold_pct ?? 15,
    importance: rule.importance,
  };
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeEvidence(result: DetectionResult, recoveryPasses: number) {
  return {
    reasonCode: result.reasonCode,
    statistic: result.evidence.statistic ?? null,
    direction: result.evidence.direction ?? null,
    sourceHealth: result.evidence.sourceHealth ?? null,
    currentSamples: result.currentSampleSize,
    referenceSamples: result.referenceSampleSize,
    recoveryPasses,
  };
}

function signalCopy(rule: StoredRule, context: EntityContext, result: DetectionResult) {
  const current = result.currentValue;
  const reference = result.referenceValue;
  if (rule.signal_type === "workflow_failure_rate") return {
    title: `${context.name} reliability changed`,
    summary: `The recent failure rate is ${current?.toFixed(1) ?? "not available"}% compared with a ${reference?.toFixed(1) ?? "not available"}% reference rate.`,
  };
  if (rule.signal_type === "workflow_duration") return {
    title: `${context.name} is taking longer`,
    summary: `The recent median execution time is ${current === null ? "not available" : Math.round(current)} ms compared with ${reference === null ? "not available" : Math.round(reference)} ms in the reference period.`,
  };
  if (rule.signal_type === "metric_target_breach") return {
    title: `${context.name} is outside its target`,
    summary: `The latest measured value is ${current ?? "not available"} ${context.unit ?? ""} against a target of ${reference ?? "not available"} ${context.unit ?? ""}.`.trim(),
  };
  if (rule.signal_type === "metric_deterioration") return {
    title: `${context.name} moved outside its expected range`,
    summary: `The recent median is ${current ?? "not available"} ${context.unit ?? ""}, compared with ${reference ?? "not available"} ${context.unit ?? ""} in the reference period.`.trim(),
  };
  return {
    title: `${context.name} connection needs attention`,
    summary: `The measurement connection is ${String(result.evidence.sourceHealth ?? result.reasonCode).replaceAll("_", " ")}. Business performance is not inferred while source health is unresolved.`,
  };
}

async function operationalAreaForProcess(processId: string | null | undefined) {
  if (!processId) return null;
  const { data } = await createAdminClient().from("processes").select("operational_area_id").eq("id", processId).maybeSingle();
  return data?.operational_area_id ?? null;
}

async function ensureRules(context: EntityContext, defaults: Array<Omit<StoredRule, "id" | "organization_id" | "status">>) {
  const client = createAdminClient();
  const idColumn = context.entityType === "metric" ? "metric_id" : context.entityType === "workflow" ? "workflow_id" : "measurement_source_id";
  const { data: current, error } = await client.from("operational_signal_rules").select(ruleSelect)
    .eq("organization_id", context.organizationId).eq(idColumn, context.entityId);
  if (error) throw new Error(`Unable to load intelligence rules: ${error.code ?? "unknown"}`);
  const rules = (current ?? []) as StoredRule[];
  for (const candidate of defaults) {
    if (rules.some((rule) => rule.signal_type === candidate.signal_type)) continue;
    const payload = {
      ...candidate,
      organization_id: context.organizationId,
      metric_id: context.metricId ?? null,
      workflow_id: context.workflowId ?? null,
      measurement_source_id: context.measurementSourceId ?? null,
      configuration: { provisionedBy: "stage5a_defaults", version: 1 },
      status: "active",
    };
    const { data, error: insertError } = await client.from("operational_signal_rules").insert(payload).select(ruleSelect).single();
    if (!insertError && data) rules.push(data as StoredRule);
    else if (insertError?.code !== "23505") throw new Error(`Unable to provision intelligence rule: ${insertError?.code ?? "unknown"}`);
  }
  if (rules.length < defaults.length) {
    const { data: refreshed, error: refreshError } = await client.from("operational_signal_rules").select(ruleSelect)
      .eq("organization_id", context.organizationId).eq(idColumn, context.entityId);
    if (refreshError) throw new Error(`Unable to reload intelligence rules: ${refreshError.code ?? "unknown"}`);
    return (refreshed ?? []).filter((rule) => rule.status === "active") as StoredRule[];
  }
  return rules.filter((rule) => rule.status === "active");
}

async function recordEvaluation(rule: StoredRule, result: DetectionResult, signalId: string | null) {
  const { error } = await createAdminClient().from("operational_signal_evaluations").insert({
    organization_id: rule.organization_id,
    rule_id: rule.id,
    signal_id: signalId,
    outcome: result.outcome,
    reason_code: result.reasonCode,
    current_value: result.currentValue,
    reference_value: result.referenceValue,
    current_sample_size: result.currentSampleSize,
    reference_sample_size: result.referenceSampleSize,
    current_window_start: result.currentWindowStart,
    current_window_end: result.currentWindowEnd,
    reference_window_start: result.referenceWindowStart,
    reference_window_end: result.referenceWindowEnd,
    details: { confidence: result.confidence, severity: result.severity, ...result.evidence },
  });
  if (error) throw new Error(`Unable to record intelligence evaluation: ${error.code ?? "unknown"}`);
}

async function loadEconomicContext(context: EntityContext) {
  if (!context.metricId && !context.workflowId) return {};
  const client = createAdminClient();
  const linkedModelIds = new Set<string>();
  if (context.metricId) {
    const { data } = await client.from("value_model_metric_links").select("model_id")
      .eq("organization_id", context.organizationId).eq("metric_id", context.metricId).eq("client_visible", true).limit(20);
    for (const row of data ?? []) linkedModelIds.add(row.model_id);
  }
  if (context.workflowId) {
    const { data } = await client.from("value_model_workflows").select("model_id")
      .eq("organization_id", context.organizationId).eq("workflow_id", context.workflowId).eq("client_visible", true).limit(20);
    for (const row of data ?? []) linkedModelIds.add(row.model_id);
  }
  const { data: candidates, error } = await client.from("value_models")
    .select("id,name,currency_code,metric_id,workflow_id").eq("organization_id", context.organizationId)
    .eq("status", "active").eq("client_visible", true).not("aggregation_approved_at", "is", null).limit(50);
  if (error) return {};
  const models = (candidates ?? []).filter((model) => model.metric_id === context.metricId
    || model.workflow_id === context.workflowId || linkedModelIds.has(model.id));
  if (!models.length) return {};
  const { data: snapshots } = await client.from("value_realization_snapshots")
    .select("model_id,annualized_run_rate,period_end").eq("organization_id", context.organizationId)
    .in("model_id", models.map((model) => model.id)).eq("verification_status", "verified")
    .eq("realization_state", "realized").eq("client_visible", true).order("period_end", { ascending: false });
  const latest = new Map<string, number | null>();
  for (const snapshot of snapshots ?? []) if (!latest.has(snapshot.model_id)) latest.set(snapshot.model_id, numeric(snapshot.annualized_run_rate));
  return {
    statement: "Associated verified value context; no causation or loss is inferred.",
    models: models.map((model) => ({ id: model.id, name: model.name, currencyCode: model.currency_code,
      verifiedAnnualizedValue: latest.get(model.id) ?? null })),
  };
}

async function persistResult(rule: StoredRule, context: EntityContext, result: DetectionResult) {
  const client = createAdminClient();
  const identity = operationalSignalIdentity(context.organizationId, rule.id, context.entityId, rule.signal_type);
  const { data: existingData, error: existingError } = await client.from("operational_signals")
    .select("id,status,first_detected_at,visibility_status,publication_reason,reviewed_by_membership_id,reviewed_at,evidence_summary")
    .eq("organization_id", context.organizationId).eq("identity_key", identity).maybeSingle();
  if (existingError) throw new Error(`Unable to load intelligence signal: ${existingError.code ?? "unknown"}`);
  const existing = existingData as ExistingSignal | null;
  const priorRecoveryPasses = numeric(existing?.evidence_summary?.recoveryPasses) ?? 0;
  const transition = transitionSignal({ existingStatus: existing?.status, outcome: result.outcome, recoveryPasses: priorRecoveryPasses });
  if (result.outcome !== "triggered" && !existing) {
    await recordEvaluation(rule, result, null);
    return { outcome: result.outcome, signalId: null };
  }
  if (result.outcome === "suppressed" || result.outcome === "insufficient_data") {
    await recordEvaluation(rule, result, existing?.id ?? null);
    return { outcome: result.outcome, signalId: existing?.id ?? null };
  }

  const now = new Date().toISOString();
  const copy = signalCopy(rule, context, result);
  const economicContext = await loadEconomicContext(context);
  const automaticPublication = rule.client_publication_mode === "auto_publish"
    && rule.entity_type === "measurement_source" && rule.detection_method === "source_health"
    && result.confidence === "high";
  const visibility = automaticPublication ? "client_visible" : existing?.visibility_status ?? "internal_only";
  const publicationReason = automaticPublication ? "automatic_infrastructure" : existing?.publication_reason ?? null;
  const payload = {
    organization_id: context.organizationId,
    rule_id: rule.id,
    identity_key: identity,
    signal_type: rule.signal_type,
    entity_type: context.entityType,
    metric_id: context.metricId ?? null,
    workflow_id: context.workflowId ?? null,
    measurement_source_id: context.measurementSourceId ?? null,
    process_id: context.processId ?? null,
    operational_area_id: context.operationalAreaId ?? null,
    title: copy.title,
    business_summary: copy.summary,
    detection_method: rule.detection_method,
    current_value: result.currentValue,
    reference_value: result.referenceValue,
    absolute_deviation: result.absoluteDeviation,
    percentage_deviation: result.percentageDeviation,
    unit: context.unit ?? null,
    severity: (result.severity ?? "info") as SignalSeverity,
    confidence: result.confidence ?? "low",
    current_window_start: result.currentWindowStart,
    current_window_end: result.currentWindowEnd,
    reference_window_start: result.referenceWindowStart,
    reference_window_end: result.referenceWindowEnd,
    current_sample_size: result.currentSampleSize,
    reference_sample_size: result.referenceSampleSize,
    consecutive_periods: Math.max(1, result.consecutivePeriods),
    first_detected_at: existing?.first_detected_at ?? now,
    last_observed_at: result.currentWindowEnd,
    status: transition.status,
    resolved_at: transition.status === "resolved" ? now : null,
    visibility_status: visibility,
    publication_reason: publicationReason,
    reviewed_by_membership_id: automaticPublication ? null : existing?.reviewed_by_membership_id ?? null,
    reviewed_at: automaticPublication ? null : existing?.reviewed_at ?? null,
    evidence_summary: safeEvidence(result, transition.recoveryPasses),
    economic_context: economicContext,
  };
  const { data: signal, error } = await client.from("operational_signals").upsert(payload, { onConflict: "organization_id,identity_key" }).select("id").single();
  if (error || !signal) throw new Error(`Unable to persist intelligence signal: ${error?.code ?? "unknown"}`);
  const { error: detailError } = await client.from("operational_signal_internal_details").upsert({
    organization_id: context.organizationId,
    signal_id: signal.id,
    last_evaluation_details: { outcome: result.outcome, reasonCode: result.reasonCode, evidence: result.evidence },
  }, { onConflict: "organization_id,signal_id" });
  if (detailError) throw new Error(`Unable to persist intelligence details: ${detailError.code ?? "unknown"}`);
  await recordEvaluation(rule, result, signal.id);
  return { outcome: result.outcome, signalId: signal.id };
}

const workflowDefaults = (context: EntityContext): Array<Omit<StoredRule, "id" | "organization_id" | "status">> => [
  {
    name: `${context.name} failure-rate change`, signal_type: "workflow_failure_rate", entity_type: "workflow",
    metric_id: null, workflow_id: context.entityId, measurement_source_id: null, detection_method: "failure_rate",
    current_window_minutes: 1_440, reference_window_minutes: 43_200, minimum_current_samples: 5, minimum_reference_samples: 10,
    minimum_consecutive_periods: 1, deviation_threshold_pct: 15, recovery_threshold_pct: 5, importance: 4,
    client_publication_mode: "review_required",
  },
  {
    name: `${context.name} duration change`, signal_type: "workflow_duration", entity_type: "workflow",
    metric_id: null, workflow_id: context.entityId, measurement_source_id: null, detection_method: "duration_median",
    current_window_minutes: 1_440, reference_window_minutes: 43_200, minimum_current_samples: 5, minimum_reference_samples: 10,
    minimum_consecutive_periods: 1, deviation_threshold_pct: 50, recovery_threshold_pct: 25, importance: 3,
    client_publication_mode: "review_required",
  },
];

const metricDefaults = (context: EntityContext, hasTarget: boolean): Array<Omit<StoredRule, "id" | "organization_id" | "status">> => [
  {
    name: `${context.name} expected-range change`, signal_type: "metric_deterioration", entity_type: "metric",
    metric_id: context.entityId, workflow_id: null, measurement_source_id: null, detection_method: "rolling_median",
    current_window_minutes: 4_320, reference_window_minutes: 43_200, minimum_current_samples: 3, minimum_reference_samples: 7,
    minimum_consecutive_periods: 2, deviation_threshold_pct: 30, recovery_threshold_pct: 15, importance: 3,
    client_publication_mode: "review_required",
  },
  ...(hasTarget ? [{
    name: `${context.name} target check`, signal_type: "metric_target_breach" as const, entity_type: "metric" as const,
    metric_id: context.entityId, workflow_id: null, measurement_source_id: null, detection_method: "threshold_breach",
    current_window_minutes: 1_440, reference_window_minutes: 43_200, minimum_current_samples: 1, minimum_reference_samples: 1,
    minimum_consecutive_periods: 1, deviation_threshold_pct: null, recovery_threshold_pct: null, importance: 3 as const,
    client_publication_mode: "review_required" as const,
  }] : []),
];

const sourceDefaults = (context: EntityContext, canAutoPublish: boolean): Array<Omit<StoredRule, "id" | "organization_id" | "status">> => [{
  name: `${context.name} source health`, signal_type: "source_degraded", entity_type: "measurement_source",
  metric_id: null, workflow_id: null, measurement_source_id: context.entityId, detection_method: "source_health",
  current_window_minutes: 60, reference_window_minutes: 1_440, minimum_current_samples: 1, minimum_reference_samples: 1,
  minimum_consecutive_periods: 1, deviation_threshold_pct: null, recovery_threshold_pct: null, importance: 4,
  client_publication_mode: canAutoPublish ? "auto_publish" : "review_required",
}];

export async function evaluateWorkflow(workflowId: string, organizationId?: string) {
  const client = createAdminClient();
  let query = client.from("implementation_workflows").select("id,organization_id,workflow_name,process_id,monitoring_status").eq("id", workflowId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: workflow, error } = await query.maybeSingle();
  if (error || !workflow) throw new Error(`Workflow intelligence context unavailable: ${error?.code ?? "not_found"}`);
  const context: EntityContext = {
    organizationId: workflow.organization_id, entityId: workflow.id, entityType: "workflow", workflowId: workflow.id,
    processId: workflow.process_id, operationalAreaId: await operationalAreaForProcess(workflow.process_id), name: workflow.workflow_name,
  };
  const rules = await ensureRules(context, workflowDefaults(context));
  const oldestMinutes = Math.max(...rules.map((rule) => (rule.current_window_minutes ?? 0) + (rule.reference_window_minutes ?? 0)), 44_640);
  const since = new Date(Date.now() - oldestMinutes * 60_000).toISOString();
  const { data: rows, error: executionError } = await client.from("workflow_executions")
    .select("status,last_event_at,duration_ms").eq("organization_id", context.organizationId).eq("workflow_id", context.entityId)
    .gte("last_event_at", since).order("last_event_at", { ascending: false }).limit(1_000);
  if (executionError) throw new Error(`Workflow history unavailable: ${executionError.code ?? "unknown"}`);
  const points: WorkflowExecutionPoint[] = (rows ?? []).map((row) => ({
    status: row.status as WorkflowExecutionPoint["status"], observedAt: row.last_event_at, durationMs: numeric(row.duration_ms),
  }));
  const results = [];
  for (const rule of rules) {
    const result = rule.signal_type === "workflow_duration"
      ? evaluateWorkflowDuration({ executions: points, rule: toRule(rule) })
      : evaluateWorkflowFailureRate({ executions: points, rule: toRule(rule) });
    results.push(await persistResult(rule, context, result));
  }
  return results;
}

export async function evaluateWorkflowExecution(executionId: string) {
  const { data, error } = await createAdminClient().from("workflow_executions").select("organization_id,workflow_id").eq("id", executionId).maybeSingle();
  if (error || !data) throw new Error(`Workflow execution unavailable: ${error?.code ?? "not_found"}`);
  return evaluateWorkflow(data.workflow_id, data.organization_id);
}

async function sourceHealthForObservation(sourceId: string | null) {
  if (!sourceId) return { status: null as SourceHealth | null, source: null };
  const { data: source, error } = await createAdminClient().from("measurement_sources")
    .select("id,organization_id,name,status,last_successful_at,stale_after_minutes,consecutive_failures,last_record_at")
    .eq("id", sourceId).maybeSingle();
  if (error || !source) return { status: null as SourceHealth | null, source: null };
  let status = source.status as SourceHealth;
  const lastHealthy = source.last_successful_at ?? source.last_record_at;
  if (lastHealthy && source.stale_after_minutes && status === "healthy"
      && Date.now() - Date.parse(lastHealthy) > source.stale_after_minutes * 60_000) status = "stale";
  return { status, source };
}

export async function evaluateMetric(metricId: string, organizationId?: string) {
  const client = createAdminClient();
  let query = client.from("measurement_metrics").select("id,organization_id,name,unit,improvement_direction,process_id,status").eq("id", metricId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: metric, error } = await query.maybeSingle();
  if (error || !metric) throw new Error(`Metric intelligence context unavailable: ${error?.code ?? "not_found"}`);
  const { data: target } = await client.from("metric_targets").select("value").eq("organization_id", metric.organization_id).eq("metric_id", metric.id).maybeSingle();
  const context: EntityContext = {
    organizationId: metric.organization_id, entityId: metric.id, entityType: "metric", metricId: metric.id,
    processId: metric.process_id, operationalAreaId: await operationalAreaForProcess(metric.process_id), name: metric.name, unit: metric.unit,
  };
  const rules = await ensureRules(context, metricDefaults(context, Boolean(target)));
  const oldestMinutes = Math.max(...rules.map((rule) => (rule.current_window_minutes ?? 0) + (rule.reference_window_minutes ?? 0)), 44_640);
  const since = new Date(Date.now() - oldestMinutes * 60_000).toISOString();
  const { data: rows, error: observationError } = await client.from("metric_observations")
    .select("measured_value,measured_at,sample_size,aggregation_method,period_start,period_end,measurement_source_id")
    .eq("organization_id", context.organizationId).eq("metric_id", context.entityId).neq("measurement_status", "rejected")
    .gte("measured_at", since).order("measured_at", { ascending: false }).limit(1_000);
  if (observationError) throw new Error(`Metric history unavailable: ${observationError.code ?? "unknown"}`);
  const sourceId = rows?.find((row) => row.measurement_source_id)?.measurement_source_id ?? null;
  const { status: sourceHealth } = await sourceHealthForObservation(sourceId);
  const points: NumericPoint[] = (rows ?? []).flatMap((row) => {
    const value = numeric(row.measured_value);
    return value === null ? [] : [{ value, observedAt: row.measured_at, sampleSize: row.sample_size,
      aggregation: row.aggregation_method, periodStart: row.period_start, periodEnd: row.period_end }];
  });
  const results = [];
  for (const rule of rules) {
    const result = rule.signal_type === "metric_target_breach" && target
      ? evaluateTargetBreach({ points, target: Number(target.value), direction: metric.improvement_direction as ImprovementDirection, sourceHealth })
      : evaluateMetricDeviation({ points, rule: toRule(rule), direction: metric.improvement_direction as ImprovementDirection, sourceHealth });
    results.push(await persistResult(rule, context, result));
  }
  return results;
}

export async function evaluateMetricObservation(observationId: string) {
  const { data, error } = await createAdminClient().from("metric_observations").select("organization_id,metric_id").eq("id", observationId).maybeSingle();
  if (error || !data) throw new Error(`Metric observation unavailable: ${error?.code ?? "not_found"}`);
  return evaluateMetric(data.metric_id, data.organization_id);
}

export async function evaluateMeasurementSource(sourceId: string, organizationId?: string) {
  const client = createAdminClient();
  let query = client.from("measurement_sources")
    .select("id,organization_id,name,status,client_visible,last_successful_at,last_record_at,stale_after_minutes,consecutive_failures").eq("id", sourceId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: source, error } = await query.maybeSingle();
  if (error || !source) throw new Error(`Measurement source intelligence context unavailable: ${error?.code ?? "not_found"}`);
  const context: EntityContext = {
    organizationId: source.organization_id, entityId: source.id, entityType: "measurement_source",
    measurementSourceId: source.id, name: source.name,
  };
  const rules = await ensureRules(context, sourceDefaults(context, source.client_visible));
  const lastHealthy = source.last_successful_at ?? source.last_record_at;
  const staleMinutes = lastHealthy ? Math.max(0, Math.round((Date.now() - Date.parse(lastHealthy)) / 60_000)) : null;
  let status = source.status as SourceHealth;
  if (staleMinutes !== null && source.stale_after_minutes && status === "healthy" && staleMinutes > source.stale_after_minutes) status = "stale";
  const result = evaluateSourceHealth({ status, consecutiveFailures: source.consecutive_failures ?? 0, staleMinutes });
  const outputs = [];
  for (const rule of rules) outputs.push(await persistResult(rule, context, result));
  const { data: mappings } = await client.from("measurement_source_mappings").select("metric_id")
    .eq("organization_id", source.organization_id).eq("source_id", source.id).eq("status", "active");
  for (const metricId of new Set((mappings ?? []).map((mapping) => mapping.metric_id))) {
    await evaluateMetric(metricId, source.organization_id);
  }
  return outputs;
}

export async function evaluateOrganizationIntelligence(organizationId: string) {
  const client = createAdminClient();
  const [{ data: workflows }, { data: metrics }, { data: sources }] = await Promise.all([
    client.from("implementation_workflows").select("id").eq("organization_id", organizationId).neq("monitoring_status", "disabled").limit(200),
    client.from("measurement_metrics").select("id").eq("organization_id", organizationId).eq("status", "active").limit(500),
    client.from("measurement_sources").select("id").eq("organization_id", organizationId).neq("status", "disabled").limit(200),
  ]);
  for (const workflow of workflows ?? []) await evaluateWorkflow(workflow.id, organizationId);
  for (const metric of metrics ?? []) await evaluateMetric(metric.id, organizationId);
  for (const source of sources ?? []) await evaluateMeasurementSource(source.id, organizationId);
  return { workflows: workflows?.length ?? 0, metrics: metrics?.length ?? 0, sources: sources?.length ?? 0 };
}

export async function evaluateScheduledOperationalIntelligence() {
  const { data: rows, error } = await createAdminClient().from("organizations").select("id").eq("status", "active").limit(100);
  if (error) throw new Error(`Unable to schedule intelligence evaluation: ${error.code ?? "unknown"}`);
  const outcomes = [];
  for (const organization of rows ?? []) outcomes.push(await evaluateOrganizationIntelligence(organization.id));
  return outcomes;
}

export type IntelligenceEvaluationOutcome = SignalOutcome;
