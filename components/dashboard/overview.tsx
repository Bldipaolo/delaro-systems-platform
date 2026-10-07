import { ArrowIcon } from "@/components/layout/icons";
import type { ClientOverview, Initiative } from "@/lib/domain";

function Status({ status }: { status: Initiative["status"] }) {
  const label = status === "At risk" ? "Needs attention" : status;
  return <span className={`status status-${status.toLowerCase().replace(" ", "-")}`}><span className="status-dot"/>{label}</span>;
}

function Progress({ value }: { value: number }) {
  return <div className="progress-track" aria-label={`${value}% complete`}><span style={{ width: `${value}%` }}/></div>;
}

export function ClientOverview({ overview }: { overview: ClientOverview }) {
  return <main className="content">
    <section className="page-intro"><div><p className="eyebrow">Your workspace</p><h1>See what is changing.</h1><p className="intro-copy">A simple view of the work underway at {overview.organizationName}, what it is helping, and where your input is needed next.</p></div><div className="review-callout"><span>Next check-in</span><strong>{overview.reviewDate}</strong><a href="/reviews">View check-in details <ArrowIcon size={14}/></a></div></section>
    <section className="summary-strip" aria-label="Engagement summary">
      <div className="summary-item"><span>Projects underway</span><strong>{overview.activeInitiatives.length.toString().padStart(2, "0")}</strong><small>Work currently in motion</small></div>
      <div className="summary-item"><span>Expected impact</span><strong>{overview.estimatedOpportunityValue}</strong><small>To be confirmed</small></div>
      <div className="summary-item"><span>Impact so far</span><strong>{overview.realizedValue}</strong><small>Verified results only</small></div>
      <div className="summary-item summary-attention"><span>Needs your input</span><strong>{overview.blockers.toString().padStart(2, "0")}</strong><small>Questions to resolve</small></div>
    </section>
    <div className="section-heading"><div><p className="eyebrow">Focus now</p><h2>What we are working on</h2></div><span className="section-note">The few things that matter most right now</span></div>
    <section className="priority-layout"><div className="priority-list">{overview.priorities.map((priority, index) => <div className="priority-row" key={priority}><span className="priority-index">0{index + 1}</span><span>{priority}</span><ArrowIcon size={15}/></div>)}</div><aside className="diagnostic-note"><span className="note-mark">+</span><div><strong>Why these projects?</strong><p>They came from what we observed in your day-to-day work, not from a preset checklist.</p></div></aside></section>
    <div className="section-heading initiatives-heading"><div><p className="eyebrow">Work underway</p><h2>Projects in progress</h2></div><a href="/initiatives" className="text-link">View all projects <ArrowIcon size={15}/></a></div>
    <section className="initiative-list">{overview.activeInitiatives.map(initiative => <InitiativeRow key={initiative.id} initiative={initiative}/>)}</section>
    <section className="bottom-grid"><div className="value-panel"><div className="panel-heading"><div><p className="eyebrow">Impact</p><h2>What will improve</h2></div><span className="pending-badge">Evidence pending</span></div><div className="measurement-row"><div><span>Verified savings</span><strong>—</strong><small>We will confirm this together</small></div><div><span>Capacity created</span><strong>—</strong><small>We will confirm this together</small></div><div><span>Time saved</span><strong>—</strong><small>We will confirm this together</small></div></div></div><div className="attention-panel"><div className="panel-heading"><div><p className="eyebrow">Your input</p><h2>Questions to answer</h2></div><span className="count-badge">02</span></div><p>Two questions are waiting for context before the next step can begin.</p><a href="/reviews" className="text-link">See what needs you <ArrowIcon size={15}/></a></div></section>
  </main>;
}

function InitiativeRow({ initiative }: { initiative: Initiative }) {
  return <article className="initiative-row"><div className="initiative-main"><div className="initiative-title-row"><h3>{initiative.title}</h3><Status status={initiative.status}/></div><p>{initiative.objective}</p></div><div className="initiative-phase"><span>Stage</span><strong>{initiative.phase}</strong></div><div className="initiative-progress"><div className="progress-label"><span>Progress</span><strong>{initiative.progress}%</strong></div><Progress value={initiative.progress}/></div><div className="initiative-next"><span>Next step</span><strong>{initiative.nextMilestone}</strong><small>Owner · {initiative.owner}</small></div><ArrowIcon size={18}/></article>;
}
