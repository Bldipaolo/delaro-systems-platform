"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowIcon } from "@/components/layout/icons";
import { useDialogFocus } from "@/components/layout/use-dialog-focus";
import { calculateOpportunityScore, priorityForScore, priorityRank } from "@/lib/opportunities/scoring";
import type { Initiative, Opportunity, OpportunityStatus } from "@/lib/domain";

const opportunityStorageKey = "delaro.demo.opportunities";
const initiativeStorageKey = "delaro.demo.initiatives";
const statuses: Array<"All" | OpportunityStatus> = ["All", "Investigate", "Qualified", "Prioritized", "Proposed", "Approved", "Implementing", "Measuring", "Complete"];
const defaultInputs = { financialImpact: 3, frequency: 3, addressability: 3, measurementQuality: 2, strategicLeverage: 3, implementationDifficulty: 2, organizationalComplexity: 2, risk: 1 };

function timestampForSort(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function restoreDemoOpportunity(item: Opportunity & { lastUpdated?: string }): Opportunity {
  if (item.updatedAt) return item;
  const legacyTime = item.lastUpdated === "Just now" ? Date.now() : Date.parse(item.lastUpdated ?? "");
  return { ...item, updatedAt: new Date(Number.isNaN(legacyTime) ? 0 : legacyTime).toISOString() };
}

export function OpportunityPipeline({ initialOpportunities, organizationName, demoMode = true }: { initialOpportunities: Opportunity[]; organizationName: string; demoMode?: boolean }) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [statusFilter, setStatusFilter] = useState<"All" | OpportunityStatus>("All");
  const [sort, setSort] = useState<"score" | "updated" | "priority">("score");
  const [showForm, setShowForm] = useState(false);
  const dialogRef = useDialogFocus(showForm, () => setShowForm(false));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (!demoMode) { setOpportunities(initialOpportunities); return; } const saved = window.localStorage.getItem(opportunityStorageKey); if (saved) setOpportunities((JSON.parse(saved) as Opportunity[]).map(restoreDemoOpportunity)); }, [demoMode, initialOpportunities]);
  function save(next: Opportunity[]) { if (!demoMode) return; setOpportunities(next); window.localStorage.setItem(opportunityStorageKey, JSON.stringify(next)); }
  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(null), 2600); }
  const visible = useMemo(() => opportunities.filter((item) => statusFilter === "All" || item.status === statusFilter).sort((a, b) => sort === "score" ? b.score - a.score : sort === "priority" ? priorityRank[b.priority] - priorityRank[a.priority] : timestampForSort(b.updatedAt) - timestampForSort(a.updatedAt)), [opportunities, sort, statusFilter]);

  function updateStatus(id: string, status: OpportunityStatus) { if (!demoMode) return; save(opportunities.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item)); notify(status === "Approved" ? "Opportunity approved. It can now become an initiative." : "Opportunity status updated."); }
  function convertToInitiative(opportunity: Opportunity) {
    if (!demoMode) return;
    const saved = window.localStorage.getItem(initiativeStorageKey);
    const initiatives = saved ? JSON.parse(saved) as Initiative[] : [];
    if (initiatives.some((initiative) => initiative.title === opportunity.title)) { notify("An initiative already exists for this opportunity."); return; }
    const initiative: Initiative = { id: `initiative-${Date.now()}`, title: opportunity.title, objective: opportunity.consequence, phase: "Validation", owner: opportunity.owner, progress: 0, nextMilestone: "Define validation milestone", status: "On track" };
    window.localStorage.setItem(initiativeStorageKey, JSON.stringify([initiative, ...initiatives]));
    notify("Initiative created. Open Initiatives to continue the work.");
  }
  function addOpportunity(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!demoMode) return; const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const inputs = Object.fromEntries(Object.keys(defaultInputs).map((key) => [key, Math.min(5, Math.max(1, Number(values[key]) || 1))])) as typeof defaultInputs; const score = calculateOpportunityScore(inputs); const next: Opportunity = { id: `demo-${Date.now()}`, title: String(values.title), process: String(values.process), consequence: String(values.consequence), estimatedAnnualValue: values.estimatedAnnualValue ? Number(values.estimatedAnnualValue) : null, score, evidenceQuality: String(values.evidenceQuality) as Opportunity["evidenceQuality"], priority: priorityForScore(score), status: "Investigate", owner: "Jordan Davis", updatedAt: new Date().toISOString() }; save([next, ...opportunities]); setShowForm(false); notify("Opportunity added to the demo pipeline."); }

  if (!demoMode) return <>
    <div className="pipeline-toolbar"><div className="toolbar-context"><span className="toolbar-dot"/>{organizationName}</div><div className="toolbar-actions"><select aria-label="Filter opportunities by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>{statuses.map((status) => <option key={status} value={status}>{status === "All" ? "All statuses" : status}</option>)}</select><select aria-label="Sort opportunities" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="score">Sort: Score</option><option value="priority">Sort: Priority</option><option value="updated">Sort: Updated</option></select></div></div>
    <section className="opportunity-table" aria-label="Opportunity pipeline"><div className="opportunity-header"><span>Opportunity</span><span>Process</span><span>Evidence</span><span>Score</span><span>Priority</span><span>Status</span></div>{visible.length ? visible.map((opportunity) => <article className="opportunity-row" key={opportunity.id}><div><h3>{opportunity.title}</h3><p>{opportunity.consequence}</p></div><span className="table-secondary">{opportunity.process}</span><span className={`evidence evidence-${opportunity.evidenceQuality.toLowerCase()}`}>{opportunity.evidenceQuality}</span><strong className="score-value">{opportunity.score}</strong><span className={`priority priority-${opportunity.priority.toLowerCase()}`}>{opportunity.priority}</span><span>{opportunity.status}</span></article>) : <div className="pipeline-empty">No opportunities yet.</div>}</section>
    <p className="internal-note">Internal view · client users do not receive this table or its scoring fields.</p>
  </>;

  return <>
    <div className="pipeline-toolbar"><div className="toolbar-context"><span className="toolbar-dot"/>{organizationName} <span className="demo-inline">Demo data</span></div><div className="toolbar-actions"><select aria-label="Filter opportunities by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>{statuses.map((status) => <option key={status} value={status}>{status === "All" ? "All statuses" : status}</option>)}</select><select aria-label="Sort opportunities" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="score">Sort: Score</option><option value="priority">Sort: Priority</option><option value="updated">Sort: Updated</option></select><button className="primary-button" type="button" onClick={() => setShowForm(true)}>Add opportunity <ArrowIcon size={15}/></button></div></div>
    <section className="opportunity-table" aria-label="Opportunity pipeline"><div className="opportunity-header"><span>Opportunity</span><span>Process</span><span>Evidence</span><span>Score</span><span>Priority</span><span>Status</span></div>{visible.length ? visible.map((opportunity) => <article className="opportunity-row" key={opportunity.id}><div><h3>{opportunity.title}</h3><p>{opportunity.consequence}</p></div><span className="table-secondary">{opportunity.process}</span><span className={`evidence evidence-${opportunity.evidenceQuality.toLowerCase()}`}>{opportunity.evidenceQuality}</span><strong className="score-value">{opportunity.score}</strong><span className={`priority priority-${opportunity.priority.toLowerCase()}`}>{opportunity.priority}</span><div className="status-controls"><select className="status-select" aria-label={`Update ${opportunity.title} status`} value={opportunity.status} onChange={(event) => updateStatus(opportunity.id, event.target.value as OpportunityStatus)}>{statuses.slice(1).map((status) => <option key={status}>{status}</option>)}</select>{opportunity.status === "Approved" && <button className="convert-button" type="button" onClick={() => convertToInitiative(opportunity)}>Create initiative</button>}</div></article>) : <div className="pipeline-empty">No opportunities match this view.</div>}</section>
    <p className="internal-note">Internal view · client users do not receive this table or its scoring fields.</p>
    {showForm && <div className="form-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><section ref={dialogRef} className="opportunity-form-panel" role="dialog" aria-modal="true" aria-labelledby="opportunity-form-title"><div className="form-panel-header"><div><p className="eyebrow">New diagnostic record</p><h2 id="opportunity-form-title">Add opportunity</h2></div><button className="close-button" type="button" onClick={() => setShowForm(false)} aria-label="Close form">×</button></div><form className="opportunity-form" onSubmit={addOpportunity}><label>Title<input name="title" required autoFocus minLength={3} placeholder="e.g. Delayed handoff"/></label><label>Department or process<input name="process" required placeholder="e.g. Sales → Operations"/></label><label>Business consequence<textarea name="consequence" required minLength={10} placeholder="What does the current constraint cause?"/></label><div className="form-grid"><label>Evidence quality<select name="evidenceQuality" defaultValue="Low"><option>Low</option><option>Medium</option><option>High</option></select></label><label>Estimated annual value<input name="estimatedAnnualValue" type="number" min="0" placeholder="Leave blank if unknown"/></label></div><div className="score-inputs"><span className="form-section-label">Score inputs · 1–5</span>{Object.keys(defaultInputs).map((key) => <label key={key}>{key.replace(/([A-Z])/g, " $1")}<input name={key} type="number" min="1" max="5" defaultValue={defaultInputs[key as keyof typeof defaultInputs]}/></label>)}</div><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit">Add to pipeline <ArrowIcon size={15}/></button></div></form></section></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </>;
}
