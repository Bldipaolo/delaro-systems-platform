"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientWorkflow, ClientWorkflowDetail, WorkflowExecution } from "@/lib/workflow-observability/types";
import { connectionState, durationLabel, statusLabel } from "@/lib/workflow-observability/types";
import { workflowAnalytics, workflowAttention, type WorkflowPeriod } from "@/lib/workflow-observability/analytics";
import { WorkflowRealtime } from "@/components/workflows/workflow-realtime";
import { MetricComparisonTable } from "@/components/analytics/metric-comparison-table";
import type { CalculatedValueModel } from "@/lib/economic-impact/types";
import { formatCurrency } from "@/lib/analytics/format";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function observed(value: string | null) {
  if (!value) return "No event received";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : dateTime.format(date);
}

function Connection({ workflow }: { workflow: ClientWorkflow }) {
  const state = connectionState(workflow.monitoringStatus, workflow.lastReportedAt);
  const label = state === "connected" ? "Live" : state === "degraded" ? "Needs attention" : state === "stale" ? "Stale" : state === "disabled" ? "Disabled" : "Not connected";
  return <span className={`workflow-connection workflow-connection-${state}`}><i aria-hidden="true"/>{label}</span>;
}

function PeriodControl({ value, onChange }: { value: WorkflowPeriod; onChange: (value: WorkflowPeriod) => void }) {
  return <div className="workflow-period-control" aria-label="Performance period">
    {(["today", "7d", "30d"] as const).map((period) => <button type="button" key={period} aria-pressed={value === period} onClick={() => onChange(period)}>{period === "today" ? "Today" : period === "7d" ? "7 days" : "30 days"}</button>)}
  </div>;
}

function ReliabilityChart({ workflows, period }: { workflows: ClientWorkflow[]; period: WorkflowPeriod }) {
  const analytics = useMemo(() => workflowAnalytics(workflows, period), [workflows, period]);
  const maximum = Math.max(1, ...analytics.series.map((point) => point.total));
  if (!analytics.total) return <div className="workflow-chart-empty"><strong>No executions in this period</strong><span>The chart will populate when authenticated telemetry arrives.</span></div>;
  return <div className="workflow-chart" role="img" aria-label={`Execution history: ${analytics.successful} successful and ${analytics.failed} failed`}>
    <div className="workflow-chart-grid" aria-hidden="true"><i/><i/><i/></div>
    <div className="workflow-chart-bars">{analytics.series.map((point) => <div className="workflow-chart-column" key={point.date} title={`${point.label}: ${point.successful} successful, ${point.failed} failed`}>
      <div className="workflow-chart-stack" style={{ height: `${Math.max(3, (point.total / maximum) * 100)}%` }}>
        {point.failed > 0 && <span className="workflow-chart-failed" style={{ flex: point.failed }}/>}
        {point.successful > 0 && <span className="workflow-chart-success" style={{ flex: point.successful }}/>}
        {point.running > 0 && <span className="workflow-chart-running" style={{ flex: point.running }}/>}
      </div>
      {(period !== "30d" || Number(point.date.slice(-2)) % 5 === 0) && <small>{point.label}</small>}
    </div>)}</div>
  </div>;
}

function ExecutionRow({ execution, workflowId }: { execution: WorkflowExecution; workflowId: string }) {
  return <Link href={`/workflows/${encodeURIComponent(workflowId)}/executions/${encodeURIComponent(execution.id)}`} className="workflow-execution-row">
    <div><span className={`workflow-status workflow-status-${execution.status}`}>{statusLabel(execution.status)}</span><strong>Execution {execution.externalExecutionId}</strong>{execution.errorSummary && <p>{execution.errorSummary}</p>}</div>
    <dl><div><dt>Observed</dt><dd>{observed(execution.lastEventAt)}</dd></div><div><dt>Duration</dt><dd>{durationLabel(execution.durationMs)}</dd></div><div><dt>Reported by</dt><dd>{execution.monitoringSource === "n8n_error_trigger" ? "Failure monitor" : "Workflow reporter"}</dd></div></dl>
    <span className="workflow-row-open" aria-hidden="true">→</span>
  </Link>;
}

export function WorkflowsOverview({ workflows, production }: { workflows: ClientWorkflow[]; production: boolean }) {
  const [period, setPeriod] = useState<WorkflowPeriod>("7d");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("attention");
  const analytics = useMemo(() => workflowAnalytics(workflows, period), [workflows, period]);
  const attention = useMemo(() => workflowAttention(workflows), [workflows]);
  const filtered = useMemo(() => workflows.filter((workflow) => {
    const state = connectionState(workflow.monitoringStatus, workflow.lastReportedAt);
    return (!query || `${workflow.name} ${workflow.purpose ?? ""}`.toLowerCase().includes(query.toLowerCase())) && (status === "all" || state === status);
  }).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "recent") return Date.parse(b.lastReportedAt ?? "") - Date.parse(a.lastReportedAt ?? "");
    const rank = { degraded: 0, stale: 1, disconnected: 2, connected: 3, disabled: 4 };
    return rank[connectionState(a.monitoringStatus, a.lastReportedAt)] - rank[connectionState(b.monitoringStatus, b.lastReportedAt)];
  }), [workflows, query, status, sort]);

  return <main className="content workflows-page">
    <header className="workflow-page-header"><div><h1>Workflows</h1><p>Live operating status for the automations supporting your business.</p></div><WorkflowRealtime enabled={production}/></header>
    {workflows.some((workflow) => workflow.demo) && <div className="workflow-demo-note"><strong>Illustrative demo data</strong><span>These executions show how monitoring will appear. They are not production results.</span></div>}
    <section className="workflow-command-summary" aria-label="Workflow command summary"><div className="workflow-command-primary"><span>Reliability · {period === "today" ? "today" : `last ${period.replace("d", " days")}`}</span><strong>{analytics.successRate === null ? "—" : `${(analytics.successRate * 100).toFixed(1)}%`}</strong><small>{analytics.total ? `${analytics.successful} of ${analytics.successful + analytics.failed} completed executions succeeded` : "Waiting for authenticated telemetry"}</small></div><dl><div><dt>Executions</dt><dd>{analytics.total}</dd></div><div><dt>Failures</dt><dd>{analytics.failed}</dd></div><div><dt>Average runtime</dt><dd>{durationLabel(analytics.averageDurationMs)}</dd></div><div><dt>Needs attention</dt><dd>{attention.length}</dd></div></dl></section>
    <section className="workflow-performance" aria-labelledby="workflow-performance-heading"><div className="workflow-section-heading"><div><h2 id="workflow-performance-heading">Performance</h2><p>Authenticated execution outcomes, grouped by day.</p></div><PeriodControl value={period} onChange={setPeriod}/></div><ReliabilityChart workflows={workflows} period={period}/></section>
    {attention.length > 0 && <section className="workflow-attention-strip" aria-labelledby="workflow-attention-heading"><div><span>Requires attention</span><h2 id="workflow-attention-heading">{attention[0].workflow.name}</h2><p>{attention[0].execution.errorSummary ?? "The latest reported execution failed."}</p></div><Link href={`/workflows/${encodeURIComponent(attention[0].workflow.id)}`}>Review execution history →</Link></section>}
    <section className="workflow-registry" aria-labelledby="workflow-registry-heading"><div className="workflow-section-heading"><div><h2 id="workflow-registry-heading">Connected workflows</h2><p>{filtered.length} of {workflows.length} workflows shown</p></div></div>
      <div className="workflow-toolbar"><label><span className="sr-only">Search workflows</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows"/></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All states</option><option value="connected">Live</option><option value="degraded">Needs attention</option><option value="stale">Stale</option><option value="disconnected">Not connected</option></select></label><label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="attention">Attention first</option><option value="recent">Most recent</option><option value="name">Name</option></select></label></div>
      {filtered.length ? <div className="workflow-list">{filtered.map((workflow) => <Link href={`/workflows/${encodeURIComponent(workflow.id)}`} className="workflow-card" key={workflow.id}><div className="workflow-card-primary"><Connection workflow={workflow}/><h3>{workflow.name}</h3><p>{workflow.purpose ?? "Operating context is being documented."}</p></div><dl><div><dt>Latest outcome</dt><dd>{statusLabel(workflow.lastExecutionStatus)}</dd></div><div><dt>Last reported</dt><dd>{observed(workflow.lastReportedAt)}</dd></div><div><dt>Average runtime</dt><dd>{durationLabel(workflow.averageDurationMs)}</dd></div><div><dt>Recorded history</dt><dd>{workflow.successCount} successful · {workflow.failureCount} failed</dd></div></dl><span className="workflow-open">Open <span aria-hidden="true">→</span></span></Link>)}</div> : <div className="workflow-empty"><h2>No workflows match these filters</h2><p>Clear the search or choose another status to return to the full operating view.</p></div>}
    </section>
  </main>;
}

export function WorkflowDetail({ workflow, production, valueModels = [] }: { workflow: ClientWorkflowDetail; production: boolean; valueModels?: CalculatedValueModel[] }) {
  const [period, setPeriod] = useState<WorkflowPeriod>("30d");
  const [selectedMetricId, setSelectedMetricId] = useState(workflow.businessMetrics[0]?.id ?? "");
  const analytics = workflowAnalytics([workflow], period);
  const failures = workflow.executions.filter((item) => item.status === "failed");
  return <main className="content workflows-page"><Link className="workflow-back" href="/workflows">← All workflows</Link>
    <header className="workflow-page-header workflow-detail-header"><div><h1>{workflow.name}</h1><p>{workflow.purpose ?? "Operating context is being documented."}</p><Connection workflow={workflow}/></div><WorkflowRealtime enabled={production}/></header>
    {workflow.demo && <div className="workflow-demo-note"><strong>Illustrative demo data</strong><span>This execution history is not a production record.</span></div>}
    <section className="workflow-command-summary"><div className="workflow-command-primary"><span>Latest outcome</span><strong className={`workflow-outcome-${workflow.lastExecutionStatus ?? "unknown"}`}>{statusLabel(workflow.lastExecutionStatus)}</strong><small>Last reported {observed(workflow.lastReportedAt)}</small></div><dl><div><dt>Reliability</dt><dd>{analytics.successRate === null ? "—" : `${(analytics.successRate * 100).toFixed(1)}%`}</dd></div><div><dt>Executions</dt><dd>{analytics.total}</dd></div><div><dt>Failures</dt><dd>{analytics.failed}</dd></div><div><dt>Average runtime</dt><dd>{durationLabel(analytics.averageDurationMs)}</dd></div></dl></section>
    <section className="workflow-performance"><div className="workflow-section-heading"><div><h2>Execution performance</h2><p>Outcome history for this workflow.</p></div><PeriodControl value={period} onChange={setPeriod}/></div><ReliabilityChart workflows={[workflow]} period={period}/></section>
    <section className="workflow-performance" aria-labelledby="workflow-business-performance"><div className="workflow-section-heading"><div><h2 id="workflow-business-performance">Business performance</h2><p>Linked operating measures remain separate from technical execution health. Observed values are not presented as verified.</p></div><Link href="/impact">Open Impact →</Link></div>{workflow.businessMetrics.length ? <MetricComparisonTable metrics={workflow.businessMetrics} selectedId={selectedMetricId} onSelect={setSelectedMetricId}/> : <div className="workflow-empty"><h2>No business measure published</h2><p>Execution monitoring is live, but a baseline, target, and client-visible metric have not yet been connected.</p></div>}</section>
    <section className="workflow-performance" aria-labelledby="workflow-economic-impact"><div className="workflow-section-heading"><div><h2 id="workflow-economic-impact">Economic impact</h2><p>Published economic models are shown only where the workflow has a documented value mechanism.</p></div><Link href="/impact">Inspect calculations →</Link></div>{valueModels.length ? <div className="workflow-value-ledger">{valueModels.map((model) => <article key={model.id}><div><strong>{model.name}</strong><span>{model.economicMechanism ?? model.calculationMethod}</span></div><dl><div><dt>Expected annual</dt><dd>{formatCurrency(model.expectedAnnualValue, model.currencyCode)}</dd></div><div><dt>Realized</dt><dd>{formatCurrency(model.realizedValue, model.currencyCode)}</dd></div><div><dt>Verified</dt><dd>{formatCurrency(model.verifiedRealizedValue, model.currencyCode)}</dd></div></dl></article>)}</div> : <div className="workflow-empty"><h2>No economic model established</h2><p>This workflow may still create operational value. Delaro has not assigned a financial amount without sufficient evidence.</p></div>}</section>
    {failures.length > 0 && <section className="workflow-warning" aria-labelledby="workflow-warning-heading"><span>Requires attention</span><h2 id="workflow-warning-heading">{failures[0].errorSummary ?? "A workflow execution failed."}</h2><p>Recorded {observed(failures[0].lastEventAt)}. Review the source system and established support procedure before retrying.</p></section>}
    <section className="workflow-history" aria-labelledby="workflow-history-heading"><div className="workflow-section-heading"><div><h2 id="workflow-history-heading">Execution history</h2><p>{workflow.executionTotal} authenticated records</p></div><span>Page {workflow.executionPage} of {workflow.executionPageCount}</span></div>{workflow.executions.length ? workflow.executions.map((item) => <ExecutionRow execution={item} workflowId={workflow.id} key={item.id}/>) : <div className="workflow-empty"><h2>No execution events</h2><p>The workflow is registered, but Delaro has not received an authenticated execution report.</p></div>}{workflow.executionPageCount > 1 && <nav className="workflow-pagination" aria-label="Execution history pages">{workflow.executionPage > 1 && <Link href={`?page=${workflow.executionPage - 1}`}>← Newer</Link>}<span>{workflow.executionPage} / {workflow.executionPageCount}</span>{workflow.executionPage < workflow.executionPageCount && <Link href={`?page=${workflow.executionPage + 1}`}>Older →</Link>}</nav>}</section>
  </main>;
}

export function WorkflowExecutionDetail({ workflow, execution }: { workflow: ClientWorkflow; execution: WorkflowExecution }) {
  return <main className="content workflows-page"><Link className="workflow-back" href={`/workflows/${encodeURIComponent(workflow.id)}`}>← {workflow.name}</Link><header className="workflow-page-header"><div><h1>Execution {execution.externalExecutionId}</h1><p>A client-safe record of the authenticated outcome reported to Delaro.</p></div><span className={`workflow-status workflow-status-${execution.status}`}>{statusLabel(execution.status)}</span></header>
    <section className="execution-detail-ledger" aria-label="Execution details"><dl><div><dt>Outcome</dt><dd>{statusLabel(execution.status)}</dd></div><div><dt>Observed</dt><dd>{observed(execution.lastEventAt)}</dd></div><div><dt>Started</dt><dd>{observed(execution.startedAt)}</dd></div><div><dt>Finished</dt><dd>{observed(execution.finishedAt)}</dd></div><div><dt>Runtime</dt><dd>{durationLabel(execution.durationMs)}</dd></div><div><dt>Reporting source</dt><dd>{execution.monitoringSource === "n8n_error_trigger" ? "Failure monitor" : "Workflow reporter"}</dd></div></dl></section>
    {execution.status === "failed" && <section className="workflow-warning"><span>Reported failure</span><h2>{execution.errorSummary ?? "The workflow reported an unsuccessful outcome."}</h2><p>{execution.errorCode ? `Reference: ${execution.errorCode}. ` : ""}Technical diagnostics and private payload data remain available only to authorized Delaro operators.</p></section>}
    <section className="execution-audit-note"><h2>What this record means</h2><p>Delaro received authenticated telemetry for this execution. It confirms the reported workflow outcome, not the correctness of every underlying business action.</p></section>
  </main>;
}
