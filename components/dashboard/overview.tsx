import { ArrowIcon } from "@/components/layout/icons";
import type { ClientOverview, Initiative } from "@/lib/domain";
import type { ClientDecision } from "@/lib/decisions/types";
import type { OperationalActivity } from "@/lib/operational-events/types";
import { ActivityHomePreview } from "@/components/activity/activity-views";

function Status({ status }: { status: Initiative["status"] }) {
  const label = status === "At risk" ? "Needs attention" : status;
  return <span className={`status status-${status.toLowerCase().replace(" ", "-")}`}><span className="status-dot"/>{label}</span>;
}

function Progress({ value }: { value: number }) {
  return <div className="progress-track" aria-label={`${value}% complete`}><span style={{ width: `${value}%` }}/></div>;
}

export function ClientOverview({ overview, attention, activity }: { overview: ClientOverview; attention: ClientDecision[]; activity: OperationalActivity }) {
  const nextDecision = attention[0];
  return <main className="content">
    <section className="page-intro"><div><p className="eyebrow">Your workspace</p><h1>See what is changing.</h1><p className="intro-copy">A simple view of the work underway at {overview.organizationName}, what it is helping, and where your input is needed next.</p></div><div className="review-callout"><span>Next decision</span><strong>{nextDecision?.title ?? "Nothing pending"}</strong><a href="/decisions">Open decisions <ArrowIcon size={14}/></a></div></section>
    <section className="summary-strip" aria-label="Engagement summary">
      <div className="summary-item"><span>Improvements underway</span><strong>{overview.activeInitiatives.length.toString().padStart(2, "0")}</strong><small>Work currently in motion</small></div>
      <div className="summary-item"><span>Expected impact</span><strong>{overview.estimatedOpportunityValue}</strong><small>To be confirmed</small></div>
      <div className="summary-item"><span>Impact so far</span><strong>{overview.realizedValue}</strong><small>Verified results only</small></div>
      <div className="summary-item summary-attention"><span>Needs your input</span><strong>{attention.length.toString().padStart(2, "0")}</strong><small>Decisions and approvals</small></div>
    </section>
    <div className="section-heading"><div><p className="eyebrow">Focus now</p><h2>What we are working on</h2></div><span className="section-note">The few things that matter most right now</span></div>
    <section className="priority-layout"><div className="priority-list">{overview.priorities.map((priority, index) => <div className="priority-row" key={priority}><span className="priority-index">0{index + 1}</span><span>{priority}</span></div>)}</div><aside className="diagnostic-note"><div><strong>Why these improvements?</strong><p>These priorities come from observed handoffs, delays, and system gaps.</p></div></aside></section>
    <div className="section-heading initiatives-heading"><div><p className="eyebrow">Work underway</p><h2>Improvements in progress</h2></div><a href="/improvements" className="text-link">View all improvements <ArrowIcon size={15}/></a></div>
    <section className="initiative-list">{overview.activeInitiatives.map(initiative => <InitiativeRow key={initiative.id} initiative={initiative}/>)}</section>
    <section className="bottom-grid"><div className="value-panel"><div className="panel-heading"><div><p className="eyebrow">Impact</p><h2>What will improve</h2></div><span className="pending-badge">Evidence pending</span></div><div className="measurement-row"><div><span>Verified savings</span><strong>—</strong><small>We will confirm this together</small></div><div><span>Capacity created</span><strong>—</strong><small>We will confirm this together</small></div><div><span>Time saved</span><strong>—</strong><small>We will confirm this together</small></div></div></div><div className="attention-panel"><div className="panel-heading"><div><p className="eyebrow">Your input</p><h2>Decisions to make</h2></div><span className="count-badge">{attention.length.toString().padStart(2, "0")}</span></div><p>{nextDecision ? nextDecision.title : "Nothing is waiting for your response right now."}</p><a href="/decisions" className="text-link">See your decisions <ArrowIcon size={15}/></a></div></section>
    <ActivityHomePreview activity={activity}/>
  </main>;
}

function InitiativeRow({ initiative }: { initiative: Initiative }) {
  return <article className="initiative-row"><div className="initiative-main"><div className="initiative-title-row"><h3>{initiative.title}</h3><Status status={initiative.status}/></div><p>{initiative.objective}</p></div><div className="initiative-phase"><span>Stage</span><strong>{initiative.phase}</strong></div><div className="initiative-progress"><div className="progress-label"><span>Progress</span><strong>{initiative.progress}%</strong></div><Progress value={initiative.progress}/></div><div className="initiative-next"><span>Next step</span><strong>{initiative.nextMilestone}</strong><small>Owner · {initiative.owner}</small></div><ArrowIcon size={18}/></article>;
}
