import type { ClientWorkflow, WorkflowExecution } from "@/lib/workflow-observability/types";

export type WorkflowPeriod = "today" | "7d" | "30d";

export type WorkflowSeriesPoint = {
  date: string;
  label: string;
  successful: number;
  failed: number;
  running: number;
  total: number;
  averageDurationMs: number | null;
};

export type WorkflowAnalytics = {
  executions: WorkflowExecution[];
  total: number;
  successful: number;
  failed: number;
  running: number;
  successRate: number | null;
  averageDurationMs: number | null;
  series: WorkflowSeriesPoint[];
};

export function executionTimestamp(execution: WorkflowExecution) {
  return execution.finishedAt ?? execution.startedAt ?? execution.lastEventAt;
}

export function periodStart(period: WorkflowPeriod, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  return start;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function workflowAnalytics(
  workflows: ClientWorkflow[],
  period: WorkflowPeriod,
  now = new Date(),
): WorkflowAnalytics {
  const start = periodStart(period, now).getTime();
  const end = now.getTime();
  const executions = workflows
    .flatMap((workflow) => workflow.executions)
    .filter((execution) => {
      const timestamp = Date.parse(executionTimestamp(execution));
      return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
    })
    .sort((a, b) => Date.parse(executionTimestamp(b)) - Date.parse(executionTimestamp(a)));

  const successful = executions.filter((execution) => execution.status === "successful").length;
  const failed = executions.filter((execution) => execution.status === "failed").length;
  const running = executions.filter((execution) => execution.status === "running").length;
  const completed = successful + failed;
  const durations = executions.flatMap((execution) => execution.durationMs === null ? [] : [execution.durationMs]);

  const dayCount = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const byDate = new Map<string, WorkflowSeriesPoint>();
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(periodStart(period, now));
    date.setDate(date.getDate() + offset);
    const key = dateKey(date);
    byDate.set(key, {
      date: key,
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
      successful: 0,
      failed: 0,
      running: 0,
      total: 0,
      averageDurationMs: null,
    });
  }

  const durationsByDate = new Map<string, number[]>();
  for (const execution of executions) {
    const date = new Date(executionTimestamp(execution));
    const key = dateKey(date);
    const point = byDate.get(key);
    if (!point) continue;
    point.total += 1;
    if (execution.status === "successful") point.successful += 1;
    if (execution.status === "failed") point.failed += 1;
    if (execution.status === "running") point.running += 1;
    if (execution.durationMs !== null) durationsByDate.set(key, [...(durationsByDate.get(key) ?? []), execution.durationMs]);
  }
  for (const [key, values] of durationsByDate) {
    const point = byDate.get(key);
    if (point) point.averageDurationMs = values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  return {
    executions,
    total: executions.length,
    successful,
    failed,
    running,
    successRate: completed ? successful / completed : null,
    averageDurationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    series: [...byDate.values()],
  };
}

export function workflowAttention(workflows: ClientWorkflow[]) {
  return workflows
    .flatMap((workflow) => workflow.executions
      .filter((execution) => execution.status === "failed")
      .map((execution) => ({ workflow, execution })))
    .sort((a, b) => Date.parse(executionTimestamp(b.execution)) - Date.parse(executionTimestamp(a.execution)));
}
