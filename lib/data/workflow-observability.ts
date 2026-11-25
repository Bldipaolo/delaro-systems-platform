import { isSupabaseConfigured, requireCurrentUserContext, requireInternalUserContext } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ClientWorkflow, ClientWorkflowDetail, ExecutionStatus, WorkflowExecution } from "@/lib/workflow-observability/types";

type Row = Record<string, unknown>;
export type InternalWorkflow = ClientWorkflow & {
  instanceReference: string;
  externalWorkflowId: string;
  platform: string;
  workflowUrl: string | null;
  registrationSource: string;
  processId: string | null;
  ownerMembershipId: string | null;
  metricId: string | null;
  clientVisible: boolean;
};

export type InternalWorkflowWorkspace = {
  organizationId: string;
  organizationName: string;
  organizations: { id: string; name: string }[];
  workflows: InternalWorkflow[];
  credentials: Row[];
  processes: { id: string; name: string }[];
  implementations: { id: string; name: string }[];
  metrics: { id: string; name: string }[];
  members: { id: string; name: string }[];
};

function text(value: unknown) { return typeof value === "string" ? value : null; }
function number(value: unknown) { return value === null || value === undefined ? null : Number(value); }

function execution(row: Row): WorkflowExecution {
  return {
    id: String(row.id), workflowId: String(row.workflow_id), externalExecutionId: String(row.external_execution_id),
    status: row.status as ExecutionStatus, startedAt: text(row.started_at), finishedAt: text(row.finished_at),
    durationMs: number(row.duration_ms), errorCode: text(row.error_code), errorSummary: text(row.error_summary),
    monitoringSource: row.monitoring_source as WorkflowExecution["monitoringSource"],
    lastEventAt: String(row.last_event_at), lastReceivedAt: String(row.last_received_at),
  };
}

function demoWorkflows(): ClientWorkflow[] {
  const now = Date.now();
  const reported = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const executions: WorkflowExecution[] = [
    { id: "demo-execution-3", workflowId: "demo-order-sync", externalExecutionId: "demo-1043", status: "successful", startedAt: reported(8), finishedAt: reported(7.7), durationMs: 18_400, errorCode: null, errorSummary: null, monitoringSource: "n8n_workflow_reporter", lastEventAt: reported(7.7), lastReceivedAt: reported(7.7) },
    { id: "demo-execution-2", workflowId: "demo-order-sync", externalExecutionId: "demo-1042", status: "failed", startedAt: reported(73), finishedAt: reported(72.8), durationMs: 11_900, errorCode: "ERP_TIMEOUT", errorSummary: "The ERP did not respond before the configured timeout. Review the connection before retrying.", monitoringSource: "n8n_error_trigger", lastEventAt: reported(72.8), lastReceivedAt: reported(72.8) },
    { id: "demo-execution-1", workflowId: "demo-order-sync", externalExecutionId: "demo-1041", status: "successful", startedAt: reported(138), finishedAt: reported(137.6), durationMs: 23_200, errorCode: null, errorSummary: null, monitoringSource: "n8n_workflow_reporter", lastEventAt: reported(137.6), lastReceivedAt: reported(137.6) },
  ];
  return [{ id: "demo-order-sync", implementationId: "demo-capacity-visibility", name: "Order synchronization", purpose: "Keeps approved production orders aligned between intake and scheduling.", environment: "production", operationalStatus: "active", monitoringStatus: "connected", lastSuccessAt: executions[0].finishedAt, lastFailureAt: executions[1].finishedAt, lastReportedAt: executions[0].lastEventAt, lastExecutionStatus: "successful", executionCount: 3, successCount: 2, failureCount: 1, averageDurationMs: 17_833, executions, demo: true }];
}

export async function getClientWorkflows(): Promise<ClientWorkflow[]> {
  if (!isSupabaseConfigured()) return demoWorkflows();
  const context = await requireCurrentUserContext();
  if (!context) return [];
  const client = await createClient();
  if (!client) throw new Error("Workflow monitoring is unavailable.");
  const { data: workflowRows, error: workflowError } = await client.rpc("get_client_workflow_monitoring", { target_organization_id: context.organization.id });
  if (workflowError) throw new Error(`Unable to load workflow monitoring: ${workflowError.message}`);
  const ids = (workflowRows ?? []).map((row: Row) => String(row.workflow_id));
  let executionRows: Row[] = [];
  if (ids.length) {
    const { data, error } = await client.from("workflow_executions")
      .select("id,workflow_id,external_execution_id,status,started_at,finished_at,duration_ms,error_code,error_summary,monitoring_source,last_event_at,last_received_at")
      .eq("organization_id", context.organization.id).in("workflow_id", ids)
      .gte("last_event_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("last_event_at", { ascending: false }).limit(1000);
    if (error) throw new Error(`Unable to load workflow execution history: ${error.message}`);
    executionRows = (data ?? []) as unknown as Row[];
  }
  return ((workflowRows ?? []) as Row[]).map((row) => ({
    id: String(row.workflow_id), implementationId: text(row.implementation_id), name: String(row.workflow_name),
    purpose: text(row.purpose), environment: String(row.environment), operationalStatus: String(row.operational_status),
    monitoringStatus: String(row.monitoring_status), lastSuccessAt: text(row.last_successful_execution_at),
    lastFailureAt: text(row.last_failure_at), lastReportedAt: text(row.last_reported_at),
    lastExecutionStatus: text(row.last_execution_status) as ExecutionStatus | null,
    executionCount: Number(row.execution_count ?? 0), successCount: Number(row.success_count ?? 0),
    failureCount: Number(row.failure_count ?? 0), averageDurationMs: number(row.average_duration_ms),
    executions: executionRows.filter((item) => item.workflow_id === row.workflow_id).map(execution), demo: false,
  }));
}

export async function getClientWorkflow(workflowId: string, page = 1, pageSize = 25): Promise<ClientWorkflowDetail | null> {
  const workflow = (await getClientWorkflows()).find((item) => item.id === workflowId);
  if (!workflow) return null;
  if (!isSupabaseConfigured() || workflow.demo) {
    const start = (page - 1) * pageSize;
    const executionTotal = workflow.executions.length;
    return { ...workflow, executions: workflow.executions.slice(start, start + pageSize), executionTotal,
      executionPage: page, executionPageSize: pageSize, executionPageCount: Math.max(1, Math.ceil(executionTotal / pageSize)) };
  }
  const context = await requireCurrentUserContext();
  const client = await createClient();
  if (!context || !client) return null;
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(50, Math.max(10, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  const { data, error, count } = await client.from("workflow_executions")
    .select("id,workflow_id,external_execution_id,status,started_at,finished_at,duration_ms,error_code,error_summary,monitoring_source,last_event_at,last_received_at", { count: "exact" })
    .eq("organization_id", context.organization.id).eq("workflow_id", workflowId)
    .order("last_event_at", { ascending: false }).range(from, from + safePageSize - 1);
  if (error) throw new Error(`Unable to load workflow execution history: ${error.message}`);
  const executionTotal = count ?? 0;
  return { ...workflow, executions: ((data ?? []) as unknown as Row[]).map(execution), executionTotal,
    executionPage: safePage, executionPageSize: safePageSize,
    executionPageCount: Math.max(1, Math.ceil(executionTotal / safePageSize)) };
}

export async function getClientWorkflowExecution(workflowId: string, executionId: string) {
  const workflow = (await getClientWorkflows()).find((item) => item.id === workflowId);
  if (!workflow) return null;
  if (!isSupabaseConfigured() || workflow.demo) {
    const item = workflow.executions.find((candidate) => candidate.id === executionId);
    return item ? { workflow, execution: item } : null;
  }
  const context = await requireCurrentUserContext();
  const client = await createClient();
  if (!context || !client) return null;
  const { data, error } = await client.from("workflow_executions")
    .select("id,workflow_id,external_execution_id,status,started_at,finished_at,duration_ms,error_code,error_summary,monitoring_source,last_event_at,last_received_at")
    .eq("organization_id", context.organization.id).eq("workflow_id", workflowId).eq("id", executionId).maybeSingle();
  if (error) throw new Error(`Unable to load workflow execution: ${error.message}`);
  return data ? { workflow, execution: execution(data as unknown as Row) } : null;
}

export async function getInternalWorkflowMonitoring(requestedOrganizationId?: string): Promise<InternalWorkflowWorkspace> {
  const context = await requireInternalUserContext();
  if (!context) return {
    organizationId: "demo-northstar", organizationName: "Northstar Manufacturing",
    organizations: [{ id: "demo-northstar", name: "Northstar Manufacturing" }],
    workflows: demoWorkflows().map((workflow) => ({ ...workflow, instanceReference: "Demo n8n instance", externalWorkflowId: "demo-workflow", platform: "n8n_cloud", workflowUrl: null, registrationSource: "direct", processId: null, ownerMembershipId: null, metricId: null, clientVisible: true })),
    credentials: [], processes: [], implementations: [], metrics: [], members: [],
  };
  const client = await createClient();
  if (!client) throw new Error("Workflow monitoring is unavailable.");
  const internalOrganizationIds = new Set(context.memberships
    .filter((membership) => canViewInternalWorkspace(membership.role))
    .map((membership) => membership.organizationId));
  const organizations = context.organizations
    .filter((organization) => internalOrganizationIds.has(organization.id))
    .map((organization) => ({ id: organization.id, name: organization.name }));
  const selectedOrganization = organizations.find((organization) => organization.id === requestedOrganizationId)
    ?? organizations.find((organization) => organization.id === context.organization.id)
    ?? organizations[0];
  if (!selectedOrganization) throw new Error("No internal client organization is available.");
  const organizationId = selectedOrganization.id;

  const [workflowResult, credentialResult, executionResult, processResult, implementationResult, metricResult, membershipResult, workflowMetricResult] = await Promise.all([
    client.from("implementation_workflows").select("id,implementation_id,process_id,owner_membership_id,workflow_name,purpose,platform,environment,operational_status,monitoring_status,last_successful_execution_at,last_failure_at,instance_reference,external_workflow_id,workflow_url,registration_source,client_visible").eq("organization_id", organizationId).order("workflow_name"),
    client.from("workflow_ingestion_credentials").select("id,workflow_id,label,token_hint,status,rate_limit_per_minute,expires_at,last_used_at,created_at,revoked_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    client.from("workflow_executions").select("id,workflow_id,external_execution_id,status,started_at,finished_at,duration_ms,error_code,error_summary,monitoring_source,last_event_at,last_received_at").eq("organization_id", organizationId).order("last_event_at", { ascending: false }).limit(200),
    client.from("processes").select("id,name").eq("organization_id", organizationId).order("name"),
    client.from("implementations").select("id,name").eq("organization_id", organizationId).order("name"),
    client.from("measurement_metrics").select("id,name,unit").eq("organization_id", organizationId).order("name"),
    client.from("organization_memberships").select("id,user_id,role,status").eq("organization_id", organizationId).eq("status", "active"),
    client.from("workflow_metrics").select("workflow_id,metric_id").eq("organization_id", organizationId),
  ]);
  for (const result of [workflowResult, credentialResult, executionResult, processResult, implementationResult, metricResult, membershipResult, workflowMetricResult]) if (result.error) throw new Error(`Unable to load internal workflow monitoring: ${result.error.message}`);
  const membershipRows = (membershipResult.data ?? []) as unknown as Row[];
  const userIds = membershipRows.map((row) => String(row.user_id));
  const profileResult = userIds.length
    ? await client.from("profiles").select("id,email,full_name").in("id", userIds)
    : { data: [], error: null };
  if (profileResult.error) throw new Error(`Unable to load workflow owners: ${profileResult.error.message}`);
  const profileById = new Map(((profileResult.data ?? []) as unknown as Row[]).map((row) => [String(row.id), row]));
  const workflowMetricRows = (workflowMetricResult.data ?? []) as unknown as Row[];
  const executionRows = (executionResult.data ?? []) as unknown as Row[];
  return {
    organizationId, organizationName: selectedOrganization.name, organizations,
    workflows: ((workflowResult.data ?? []) as unknown as Row[]).map((row): InternalWorkflow => {
      const rows = executionRows.filter((item) => item.workflow_id === row.id).map(execution);
      return { id: String(row.id), implementationId: text(row.implementation_id), name: String(row.workflow_name), purpose: text(row.purpose), environment: String(row.environment), operationalStatus: String(row.operational_status), monitoringStatus: String(row.monitoring_status), lastSuccessAt: text(row.last_successful_execution_at), lastFailureAt: text(row.last_failure_at), lastReportedAt: rows[0]?.lastEventAt ?? null, lastExecutionStatus: rows[0]?.status ?? null, executionCount: rows.length, successCount: rows.filter((item) => item.status === "successful").length, failureCount: rows.filter((item) => item.status === "failed").length, averageDurationMs: rows.length ? rows.reduce((sum, item) => sum + (item.durationMs ?? 0), 0) / rows.filter((item) => item.durationMs !== null).length || null : null, executions: rows, demo: false, instanceReference: String(row.instance_reference), externalWorkflowId: String(row.external_workflow_id), platform: String(row.platform), workflowUrl: text(row.workflow_url), registrationSource: String(row.registration_source), processId: text(row.process_id), ownerMembershipId: text(row.owner_membership_id), metricId: text(workflowMetricRows.find((item) => item.workflow_id === row.id)?.metric_id), clientVisible: row.client_visible === true };
    }),
    credentials: (credentialResult.data ?? []) as unknown as Row[],
    processes: ((processResult.data ?? []) as unknown as Row[]).map((row) => ({ id: String(row.id), name: String(row.name) })),
    implementations: ((implementationResult.data ?? []) as unknown as Row[]).map((row) => ({ id: String(row.id), name: String(row.name) })),
    metrics: ((metricResult.data ?? []) as unknown as Row[]).map((row) => ({ id: String(row.id), name: `${String(row.name)} · ${String(row.unit)}` })),
    members: membershipRows.map((row) => {
      const profile = profileById.get(String(row.user_id));
      return { id: String(row.id), name: text(profile?.full_name) ?? text(profile?.email) ?? String(row.role).replaceAll("_", " ") };
    }),
  };
}
