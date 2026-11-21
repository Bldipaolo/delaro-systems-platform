import Link from "next/link";
import type { ClientWorkflow, WorkflowExecution } from "@/lib/workflow-observability/types";
import { connectionState, durationLabel, statusLabel } from "@/lib/workflow-observability/types";
import { WorkflowRealtime } from "@/components/workflows/workflow-realtime";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function observed(value: string | null) {
  if (!value) return "No event received";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : dateTime.format(date);
}

function Connection({ workflow }: { workflow: ClientWorkflow }) {
  const state = connectionState(workflow.monitoringStatus, workflow.lastReportedAt);
  const label = state === "connected" ? "Monitoring live" : state === "stale" ? "Monitoring stale" : state === "disabled" ? "Monitoring disabled" : "Monitoring disconnected";
  return <span className={`workflow-connection workflow-connection-${state}`}><i aria-hidden="true"/>{label}</span>;
}

function ExecutionRow({ execution }: { execution: WorkflowExecution }) {
  return <div className="workflow-execution-row">
    <div><span className={`workflow-status workflow-status-${execution.status}`}>{statusLabel(execution.status)}</span><strong>Execution {execution.externalExecutionId}</strong>{execution.errorSummary && <p>{execution.errorSummary}</p>}</div>
    <dl><div><dt>Observed</dt><dd>{observed(execution.lastEventAt)}</dd></div><div><dt>Duration</dt><dd>{durationLabel(execution.durationMs)}</dd></div><div><dt>Source</dt><dd>{execution.monitoringSource === "n8n_error_trigger" ? "Failure monitor" : "Workflow reporter"}</dd></div></dl>
  </div>;
}

export function WorkflowsOverview({ workflows, production }: { workflows: ClientWorkflow[]; production: boolean }) {
  const active = workflows.filter((workflow) => connectionState(workflow.monitoringStatus, workflow.lastReportedAt) === "connected").length;
  const failures = workflows.reduce((sum, workflow) => sum + workflow.failureCount, 0);
  return <main className="content workflows-page">
    <header className="workflow-page-header"><div><p className="eyebrow">Operational continuity</p><h1>Workflows</h1><p>Current activity from the automated systems supporting your operation.</p></div><WorkflowRealtime enabled={production}/></header>
    {workflows.some((workflow) => workflow.demo) && <div className="workflow-demo-note"><strong>Illustrative demo data</strong><span>These executions show how live monitoring will appear. They are not production results.</span></div>}
    <section className="workflow-kpis" aria-label="Workflow summary"><div><span>Registered</span><strong>{workflows.length}</strong></div><div><span>Reporting now</span><strong>{active}</strong></div><div><span>Recorded executions</span><strong>{workflows.reduce((sum, workflow) => sum + workflow.executionCount, 0)}</strong></div><div><span>Failures in history</span><strong>{failures}</strong></div></section>
    <section className="workflow-registry" aria-labelledby="workflow-registry-heading"><div className="workflow-section-heading"><div><p className="eyebrow">Connected operation</p><h2 id="workflow-registry-heading">Registered workflows</h2></div><span>Freshness is based on the last authenticated event.</span></div>
      {workflows.length ? <div className="workflow-list">{workflows.map((workflow) => <Link href={`/workflows/${encodeURIComponent(workflow.id)}`} className="workflow-card" key={workflow.id}><div className="workflow-card-primary"><Connection workflow={workflow}/><h3>{workflow.name}</h3><p>{workflow.purpose}</p></div><dl><div><dt>Latest</dt><dd>{statusLabel(workflow.lastExecutionStatus)}</dd></div><div><dt>Last reported</dt><dd>{observed(workflow.lastReportedAt)}</dd></div><div><dt>Average duration</dt><dd>{durationLabel(workflow.averageDurationMs)}</dd></div><div><dt>History</dt><dd>{workflow.successCount} successful · {workflow.failureCount} failed</dd></div></dl><span className="workflow-open">View history <span aria-hidden="true">→</span></span></Link>)}</div> : <div className="workflow-empty"><h2>No workflows are reporting yet</h2><p>Your Delaro team will connect approved automations here. Until an authenticated event is received, monitoring remains explicitly disconnected.</p></div>}
    </section>
  </main>;
}

export function WorkflowDetail({ workflow, production }: { workflow: ClientWorkflow; production: boolean }) {
  const failures = workflow.executions.filter((item) => item.status === "failed");
  return <main className="content workflows-page">
    <Link className="workflow-back" href="/workflows">← All workflows</Link>
    <header className="workflow-page-header workflow-detail-header"><div><p className="eyebrow">{workflow.environment} workflow</p><h1>{workflow.name}</h1><p>{workflow.purpose}</p><Connection workflow={workflow}/></div><WorkflowRealtime enabled={production}/></header>
    {workflow.demo && <div className="workflow-demo-note"><strong>Illustrative demo data</strong><span>This execution history is not a production record.</span></div>}
    <section className="workflow-kpis" aria-label="Workflow performance"><div><span>Last outcome</span><strong>{statusLabel(workflow.lastExecutionStatus)}</strong></div><div><span>Successful</span><strong>{workflow.successCount}</strong></div><div><span>Failed</span><strong>{workflow.failureCount}</strong></div><div><span>Average duration</span><strong>{durationLabel(workflow.averageDurationMs)}</strong></div></section>
    {failures.length > 0 && <section className="workflow-warning" aria-labelledby="workflow-warning-heading"><p className="eyebrow">Requires attention</p><h2 id="workflow-warning-heading">{failures[0].errorSummary ?? "A workflow execution failed."}</h2><p>Last recorded {observed(failures[0].lastEventAt)}. Review the source system and follow the established support procedure before retrying.</p></section>}
    <section className="workflow-history" aria-labelledby="workflow-history-heading"><div className="workflow-section-heading"><div><p className="eyebrow">Authenticated event history</p><h2 id="workflow-history-heading">Recent executions</h2></div><span>{workflow.executions.length} shown</span></div>{workflow.executions.length ? workflow.executions.map((item) => <ExecutionRow execution={item} key={item.id}/>) : <div className="workflow-empty"><h2>No execution events</h2><p>The workflow is registered, but Delaro has not received an authenticated execution report.</p></div>}</section>
  </main>;
}
