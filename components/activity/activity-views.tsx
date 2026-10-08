import Link from "next/link";
import type { InternalOperationalEvent, OperationalActivity, OperationalEvent, OperationalException } from "@/lib/operational-events/types";

const severityLabel = { info: "Update", warning: "Review", critical: "Important" };
const exceptionLabel = { open: "Open", investigating: "Being investigated", awaiting_client: "Waiting for your input", resolved: "Resolved", dismissed: "Dismissed" };
const eventStatusLabel = { recorded: "Recorded", needs_attention: "Needs attention", resolved: "Resolved" };

function occurredAt(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function ExceptionRow({ item }: { item: OperationalException }) {
  return <article className="activity-exception-row">
    <div className="activity-row-top"><span className={`activity-severity severity-${item.severity}`}>{severityLabel[item.severity]}</span><span>{exceptionLabel[item.status]}</span></div>
    <h3>{item.title}</h3><p>{item.summary}</p>
    <div className="activity-row-meta"><time dateTime={item.occurredAt}>{occurredAt(item.occurredAt)}</time>{item.decisionId && <Link href={`/decisions#decision-${encodeURIComponent(item.decisionId)}`}>Open decision →</Link>}</div>
  </article>;
}

function EventRow({ item }: { item: OperationalEvent }) {
  return <article className="activity-event-row">
    <div className="activity-event-time"><time dateTime={item.occurredAt}>{occurredAt(item.occurredAt)}</time></div>
    <div className="activity-event-body"><div className="activity-row-top"><span className={`activity-severity severity-${item.severity}`}>{severityLabel[item.severity]}</span><span>{eventStatusLabel[item.status]}</span></div><p>{item.summary}</p><small>{item.systemName ?? item.source}{item.systemName && item.source !== item.systemName ? ` · ${item.source}` : ""}</small></div>
  </article>;
}

export function ActivityWorkspace({ activity }: { activity: OperationalActivity }) {
  return <main className="content activity-page">
    <section className="page-intro compact"><div><p className="eyebrow">Operations</p><h1>Activity</h1><p className="intro-copy">A clear record of what happened, what changed, and what needs attention. Technical logs stay with Delaro.</p></div>{activity.demo && <span className="activity-demo-label">Northstar · Demo examples</span>}</section>
    <section className="activity-section" aria-labelledby="activity-attention-title"><div className="section-heading"><div><h2 id="activity-attention-title">Requires attention</h2><p className="activity-section-intro">Open issues affecting the work. Items waiting for your decision link to the decision record.</p></div></div>
      {activity.exceptions.length ? <div className="activity-exception-list">{activity.exceptions.map((item) => <ExceptionRow key={item.id} item={item}/>)}</div> : <p className="activity-empty">No open exceptions have been shared.</p>}
    </section>
    <section className="activity-section" aria-labelledby="activity-recent-title"><div className="section-heading"><div><h2 id="activity-recent-title">Recent operational activity</h2><p className="activity-section-intro">Meaningful changes and outcomes, newest first.</p></div></div>
      {activity.events.length ? <div className="activity-event-list">{activity.events.map((item) => <EventRow key={item.id} item={item}/>)}</div> : <p className="activity-empty">No operational activity has been shared yet.</p>}
    </section>
  </main>;
}

export function ActivityHomePreview({ activity }: { activity: OperationalActivity }) {
  return <section className="activity-home" aria-labelledby="home-activity-title"><div className="section-heading"><div><h2 id="home-activity-title">Operational activity</h2><p className="activity-section-intro">What changed across the work.</p></div><Link href="/activity" className="text-link">View activity →</Link></div>
    {activity.exceptions.length > 0 && <p className="activity-home-alert">{activity.exceptions.length} open {activity.exceptions.length === 1 ? "issue" : "issues"} need attention <Link href="/activity">Review →</Link></p>}
    {activity.events.length ? <div className="activity-event-list">{activity.events.slice(0, 3).map((item) => <EventRow key={item.id} item={item}/>)}</div> : <p className="activity-empty">No operational activity has been shared yet.</p>}
  </section>;
}

export function InternalActivityView({ activity, technicalEvents }: { activity: OperationalActivity; technicalEvents: InternalOperationalEvent[] }) {
  return <main className="content activity-page internal-content"><section className="page-intro compact"><div><p className="eyebrow">Delaro internal</p><h1>Operational activity</h1><p className="intro-copy">Inspect source references and diagnostics behind each operational update. Only published summaries appear in the client workspace.</p></div></section>
    <section className="activity-section" aria-labelledby="internal-attention-title"><div className="section-heading"><h2 id="internal-attention-title">Open exceptions</h2></div>{activity.exceptions.length ? <div className="activity-exception-list">{activity.exceptions.map((item) => <ExceptionRow key={item.id} item={item}/>)}</div> : <p className="activity-empty">No open exceptions recorded.</p>}</section>
    <section className="activity-section" aria-labelledby="internal-events-title"><div className="section-heading"><h2 id="internal-events-title">Event record</h2></div>{technicalEvents.length ? <div className="activity-event-list">{technicalEvents.map((item) => <article key={item.id} className="activity-technical-row"><EventRow item={item}/><details><summary>Technical details</summary><dl><div><dt>Event type</dt><dd>{item.eventType}</dd></div><div><dt>Source reference</dt><dd>{item.sourceReference ?? "Not recorded"}</dd></div><div><dt>Details</dt><dd>{item.technicalDetails ?? "Not recorded"}</dd></div></dl><pre>{JSON.stringify(item.metadata, null, 2)}</pre></details></article>)}</div> : <p className="activity-empty">No events recorded.</p>}</section>
  </main>;
}
