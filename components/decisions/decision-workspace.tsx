"use client";

import { useActionState } from "react";
import Link from "next/link";
import { commentOnDecision, respondToDecision, type DecisionActionState } from "@/app/(portal)/decisions/actions";
import { needsAttention, type ClientDecision } from "@/lib/decisions/types";

const emptyState: DecisionActionState = { error: null, success: null };
const kindLabel = { approval: "Approval", question: "Question", exception: "Exception", recommendation: "Recommendation" };
const statusLabel = { open: "Open", in_discussion: "In discussion", changes_requested: "Changes requested", approved: "Approved", declined: "Declined", resolved: "Resolved", cancelled: "Cancelled" };

function dateLabel(date: string | null) {
  if (!date) return "No due date set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function ResponseForm({ decision }: { decision: ClientDecision }) {
  const [state, action, pending] = useActionState(respondToDecision, emptyState);
  return <form className="decision-response" action={action}>
    <input type="hidden" name="decisionId" value={decision.id}/>
    <label htmlFor={`option-${decision.id}`}>Select an outcome</label>
    <select id={`option-${decision.id}`} name="optionId" defaultValue={decision.options.find((option) => option.recommended)?.id ?? decision.options[0]?.id} required>
      {decision.options.map((option) => <option key={option.id} value={option.id}>{option.title}{option.recommended ? " — recommended" : ""}</option>)}
    </select>
    {decision.riskLevel !== "standard" && <><p className="decision-risk">This {decision.riskLevel}-risk decision requires explicit human confirmation. Approval does not automatically execute the change.</p><label htmlFor={`confirm-${decision.id}`}>Type APPROVE to confirm</label><input id={`confirm-${decision.id}`} name="confirmation" autoComplete="off" placeholder="APPROVE"/></>}
    <label htmlFor={`note-${decision.id}`}>Note <span>(optional for approval; required for changes)</span></label>
    <textarea id={`note-${decision.id}`} name="note" rows={2} placeholder="Add context for the record"/>
    <div className="decision-action-row">
      <button type="submit" name="response" value="approved" disabled={pending || decision.options.length === 0}>Approve</button>
      <button type="submit" name="response" value="changes_requested" disabled={pending} className="secondary-button">Request changes</button>
    </div>
    {state.error && <p role="alert" className="decision-error">{state.error}</p>}
    {state.success && <p role="status" className="decision-success">{state.success}</p>}
  </form>;
}

function DiscussionForm({ decision }: { decision: ClientDecision }) {
  const [state, action, pending] = useActionState(commentOnDecision, emptyState);
  return <form className="decision-discussion" action={action}>
    <input type="hidden" name="decisionId" value={decision.id}/>
    <label htmlFor={`comment-${decision.id}`}>Add to the discussion</label>
    <textarea id={`comment-${decision.id}`} name="body" rows={3} required placeholder="Ask a question or add context"/>
    <button type="submit" className="secondary-button" disabled={pending}>Post comment</button>
    {state.error && <p role="alert" className="decision-error">{state.error}</p>}
    {state.success && <p role="status" className="decision-success">{state.success}</p>}
  </form>;
}

function DecisionEntry({ decision }: { decision: ClientDecision }) {
  return <article className="decision-entry" id={`decision-${decision.id}`}>
    <div className="decision-entry-top"><span className="eyebrow">{kindLabel[decision.kind]}</span><span className="decision-status">{statusLabel[decision.status]}</span></div>
    <h3>{decision.title}</h3><p className="decision-context">{decision.context}</p>
    <div className="decision-meta"><span>Requested by {decision.requestedBy}</span><span>Due {dateLabel(decision.dueDate)}</span>{decision.demo && <span>Demo example</span>}</div>
    <div className="decision-detail-grid"><div><small>Why this needs a decision</small><p>{decision.whyNeeded}</p></div>{decision.recommendation && <div><small>Recommendation</small><p>{decision.recommendation}</p></div>}{decision.operationalConsequence && <div><small>Operational consequence</small><p>{decision.operationalConsequence}</p></div>}{decision.financialConsequence && <div><small>Financial consequence</small><p>{decision.financialConsequence}</p></div>}</div>
    {decision.options.length > 0 && <div className="decision-options"><span className="eyebrow">Alternatives</span>{decision.options.map((option) => <div key={option.id} className="decision-option"><strong>{option.title}{option.recommended ? " · Recommended" : ""}</strong>{option.description && <p>{option.description}</p>}{option.consequence && <small>{option.consequence}</small>}</div>)}</div>}
    {decision.selectedOutcome && <p className="decision-outcome">Selected outcome: {decision.selectedOutcome}</p>}
    <div className="decision-links">{decision.relatedImprovementId && <Link href="/improvements">View improvement →</Link>}{decision.relatedProcessId && <Link href="/operations">View process →</Link>}{decision.kind === "recommendation" && <Link href="/impact">View business case →</Link>}</div>
    {decision.canRespond && <ResponseForm decision={decision}/>}
    {decision.canDiscuss && <details className="decision-discuss"><summary>Discuss this decision</summary><DiscussionForm decision={decision}/></details>}
    <details className="decision-history"><summary>Decision record · {decision.history.length} events{decision.comments.length ? ` · ${decision.comments.length} comments` : ""}</summary><ol>{decision.history.map((event) => <li key={event.id}><span>{event.summary}</span><time>{new Date(event.occurredAt).toLocaleDateString("en-US")}</time></li>)}</ol>{decision.comments.map((comment) => <div key={comment.id} className="decision-comment"><strong>{comment.author}</strong><p>{comment.body}</p></div>)}</details>
  </article>;
}

export function DecisionWorkspace({ decisions }: { decisions: ClientDecision[] }) {
  const attention = decisions.filter(needsAttention);
  const remaining = decisions.filter((decision) => !needsAttention(decision));
  return <main className="content decisions-page">
    <section className="page-intro compact"><div><p className="eyebrow">Shared direction</p><h1>Decisions</h1><p className="intro-copy">Approve what is ready, ask what is unclear, and keep exceptions visible. Every response stays on the record.</p></div><Link href="/reviews" className="text-link">Past check-ins →</Link></section>
    <div className="section-heading"><div><p className="eyebrow">Your queue</p><h2>Requires your attention</h2></div><span className="section-note">{attention.length} open {attention.length === 1 ? "request" : "requests"}</span></div>
    {attention.length ? <section className="decision-list" aria-label="Requires your attention">{attention.map((decision) => <DecisionEntry key={decision.id} decision={decision}/>)}</section> : <p className="decision-empty">Nothing is waiting for your response right now.</p>}
    {remaining.length > 0 && <><div className="section-heading decisions-shared-heading"><div><p className="eyebrow">Shared record</p><h2>Other decisions</h2></div></div><section className="decision-list" aria-label="Other decisions">{remaining.map((decision) => <DecisionEntry key={decision.id} decision={decision}/>)}</section></>}
  </main>;
}
