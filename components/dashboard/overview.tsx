import Link from "next/link";
import { ArrowIcon } from "@/components/layout/icons";
import type { ClientOverview as ClientOverviewData, Initiative } from "@/lib/domain";
import type { ClientDecision } from "@/lib/decisions/types";
import type { OperationalActivity } from "@/lib/operational-events/types";
import type { ClientWorkflow } from "@/lib/workflow-observability/types";
import { connectionState, durationLabel, statusLabel } from "@/lib/workflow-observability/types";
import { workflowAnalytics, workflowAttention } from "@/lib/workflow-observability/analytics";
import { ActivityHomePreview } from "@/components/activity/activity-views";
import { WorkflowRealtime } from "@/components/workflows/workflow-realtime";

function Status({ status }: { status: Initiative["status"] }) {
  const label = status === "At risk" ? "Needs attention" : status;
  return <span className={`status status-${status.toLowerCase().replace(" ", "-")}`}><span className="status-dot"/>{label}</span>;
}

function Progress({ value }: { value: number }) {
  return <div className="progress-track" aria-label={`${value}% complete`}><span style={{ width: `${value}%` }}/></div>;
}

function relativeTime(value: string | null) {
  if (!value) return "No telemetry";
  const difference = Date.now() - Date.parse(value);
  if (!Number.isFinite(difference)) return "Unknown";
  const minutes = Math.max(0, Math.round(difference / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ClientOverview({ overview, attention, activity, workflows, production }: { overview: ClientOverviewData; attention: ClientDecision[]; activity: OperationalActivity; workflows: ClientWorkflow[]; production: boolean }) {
  const analytics = workflowAnalytics(workflows, "7d");
  const workflowIssues = workflowAttention(workflows);
  const live = workflows.filter((workflow) => connectionState(workflow.monitoringStatus, workflow.lastReportedAt) === "connected").length;
  const needsAttention = attention.length + activity.exceptions.length + workflowIssues.length;
  const recentExecutions = workflows.flatMap((workflow) => workflow.executions.map((execution) => ({ workflow, execution }))).sort((a, b) => Date.parse(b.execution.lastEventAt) - Date.parse(a.execution.lastEventAt)).slice(0, 5);
  const nextDecision = attention[0];
  return <main className="content command-center">
    <header className="command-header"><div><h1>{overview.organizationName}</h1><p>Your operation now: live workflow health, work in progress, and the items that need a decision.</p></div><WorkflowRealtime enabled={production}/></header>
    {workflows.some((workflow) => workflow.demo) && <div className="workflow-demo-note"><strong>Illustrative demo workspace</strong><span>Operational and financial examples are clearly separated from production data.</span></div>}
    <section className="command-status-line" aria-label="Current operating state"><div><span className={needsAttention ? "command-state command-state-attention" : "command-state"}><i aria-hidden="true"/>{needsAttention ? `${needsAttention} items need attention` : "Operation reporting normally"}</span><small>{live} of {workflows.length} workflows reporting live</small></div><Link href={needsAttention ? "/activity" : "/workflows"}>{needsAttention ? "Review attention items" : "Open workflow monitoring"} <ArrowIcon size={14}/></Link></section>
    <section className="command-metrics" aria-label="Seven-day operational summary"><div className="command-metric-lead"><span>Workflow reliability · 7 days</span><strong>{analytics.successRate === null ? "—" : `${(analytics.successRate * 100).toFixed(1)}%`}</strong><small>{analytics.total ? `${analytics.total} authenticated executions` : "No execution telemetry in this period"}</small></div><div><span>Live workflows</span><strong>{live}</strong><small>{workflows.length - live} not currently live</small></div><div><span>Average runtime</span><strong>{durationLabel(analytics.averageDurationMs)}</strong><small>Completed executions</small></div><div><span>Improvements underway</span><strong>{overview.activeInitiatives.length}</strong><small>{overview.activeInitiatives.filter((item) => item.status === "At risk").length} need attention</small></div></section>
    <div className="command-grid">
      <section className="command-workflows" aria-labelledby="command-workflows-heading"><div className="section-heading"><div><h2 id="command-workflows-heading">Workflow status</h2><p className="activity-section-intro">The systems carrying work right now.</p></div><Link href="/workflows" className="text-link">View all <ArrowIcon size={14}/></Link></div>{workflows.length ? <div className="command-workflow-list">{workflows.slice(0, 5).map((workflow) => { const state = connectionState(workflow.monitoringStatus, workflow.lastReportedAt); return <Link href={`/workflows/${workflow.id}`} key={workflow.id}><span className={`workflow-connection workflow-connection-${state}`}><i aria-hidden="true"/>{state === "connected" ? "Live" : state === "degraded" ? "Attention" : state === "stale" ? "Stale" : "Offline"}</span><strong>{workflow.name}</strong><small>{statusLabel(workflow.lastExecutionStatus)} · {relativeTime(workflow.lastReportedAt)}</small><ArrowIcon size={14}/></Link>; })}</div> : <p className="activity-empty">No workflows have been connected.</p>}</section>
      <section className="command-attention" aria-labelledby="command-attention-heading"><div className="section-heading"><div><h2 id="command-attention-heading">Requires attention</h2><p className="activity-section-intro">Failures, exceptions, and decisions in one queue.</p></div><span className="count-badge">{needsAttention.toString().padStart(2, "0")}</span></div><div className="command-attention-list">{workflowIssues.slice(0, 2).map(({ workflow, execution }) => <Link key={execution.id} href={`/workflows/${workflow.id}/executions/${execution.id}`}><span>Workflow failure</span><strong>{workflow.name}</strong><small>{execution.errorSummary ?? "An execution failed."}</small></Link>)}{activity.exceptions.slice(0, 2).map((item) => <Link key={item.id} href="/activity"><span>Operational exception</span><strong>{item.title}</strong><small>{item.summary}</small></Link>)}{attention.slice(0, 2).map((item) => <Link key={item.id} href={`/decisions#decision-${item.id}`}><span>Decision</span><strong>{item.title}</strong><small>Client response requested</small></Link>)}{!needsAttention && <p className="activity-empty">Nothing is waiting for your response.</p>}</div></section>
    </div>
    <section className="command-activity" aria-labelledby="recent-executions-heading"><div className="section-heading"><div><h2 id="recent-executions-heading">Recent workflow activity</h2><p className="activity-section-intro">Latest authenticated execution reports.</p></div><Link href="/activity" className="text-link">All activity <ArrowIcon size={14}/></Link></div>{recentExecutions.length ? <div className="command-execution-list">{recentExecutions.map(({ workflow, execution }) => <Link href={`/workflows/${workflow.id}/executions/${execution.id}`} key={execution.id}><time dateTime={execution.lastEventAt}>{relativeTime(execution.lastEventAt)}</time><strong>{workflow.name}</strong><span className={`workflow-status workflow-status-${execution.status}`}>{statusLabel(execution.status)}</span><small>{durationLabel(execution.durationMs)}</small><ArrowIcon size={14}/></Link>)}</div> : <p className="activity-empty">No authenticated workflow activity has been received.</p>}</section>
    <div className="section-heading initiatives-heading"><div><h2>Improvements in progress</h2><p className="activity-section-intro">Operational changes now being delivered.</p></div><Link href="/improvements" className="text-link">View all improvements <ArrowIcon size={15}/></Link></div>
    <section className="initiative-list">{overview.activeInitiatives.map(initiative => <InitiativeRow key={initiative.id} initiative={initiative}/>)}</section>
    <section className="command-value-decision"><div><span>Verified impact</span><strong>{overview.realizedValue}</strong><small>Evidence-backed results only</small><Link href="/impact">Open impact analysis →</Link></div><div><span>Next decision</span><strong>{nextDecision?.title ?? "Nothing pending"}</strong><small>{nextDecision ? "Your response is required" : "No client decision is waiting"}</small><Link href="/decisions">Open decisions →</Link></div></section>
    <ActivityHomePreview activity={activity}/>
  </main>;
}

function InitiativeRow({ initiative }: { initiative: Initiative }) {
  return <article className="initiative-row"><div className="initiative-main"><div className="initiative-title-row"><h3>{initiative.title}</h3><Status status={initiative.status}/></div><p>{initiative.objective}</p></div><div className="initiative-phase"><span>Stage</span><strong>{initiative.phase}</strong></div><div className="initiative-progress"><div className="progress-label"><span>Progress</span><strong>{initiative.progress}%</strong></div><Progress value={initiative.progress}/></div><div className="initiative-next"><span>Next step</span><strong>{initiative.nextMilestone}</strong><small>Owner · {initiative.owner}</small></div><ArrowIcon size={18}/></article>;
}
