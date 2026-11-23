export const executionStatuses = ["running", "successful", "failed", "unknown"] as const;
export type ExecutionStatus = (typeof executionStatuses)[number];

export type WorkflowExecution = {
  id: string;
  workflowId: string;
  externalExecutionId: string;
  status: ExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorSummary: string | null;
  monitoringSource: "n8n_workflow_reporter" | "n8n_error_trigger" | "n8n_api_poll";
  lastEventAt: string;
  lastReceivedAt: string;
};

export type ClientWorkflow = {
  id: string;
  implementationId: string | null;
  name: string;
  purpose: string | null;
  environment: string;
  operationalStatus: string;
  monitoringStatus: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastReportedAt: string | null;
  lastExecutionStatus: ExecutionStatus | null;
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number | null;
  executions: WorkflowExecution[];
  demo: boolean;
};

export type ConnectionState = "connected" | "degraded" | "stale" | "disconnected" | "disabled";

export function connectionState(
  monitoringStatus: string,
  lastReportedAt: string | null,
  now = Date.now(),
  staleAfterMs = 24 * 60 * 60 * 1000,
): ConnectionState {
  if (monitoringStatus === "disabled") return "disabled";
  if (monitoringStatus === "not_connected" || monitoringStatus === "configured" || !lastReportedAt) return "disconnected";
  const reported = Date.parse(lastReportedAt);
  if (!Number.isFinite(reported) || now - reported > staleAfterMs) return "stale";
  if (monitoringStatus === "degraded") return "degraded";
  return "connected";
}

export function durationLabel(durationMs: number | null) {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return "Not available";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} sec`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes} min ${seconds} sec`;
}

export function statusLabel(status: ExecutionStatus | null) {
  if (!status) return "No activity";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
