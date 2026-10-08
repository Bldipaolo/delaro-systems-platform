"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Initiative, InitiativeStatus } from "@/lib/domain";
import { useDialogFocus } from "@/components/layout/use-dialog-focus";

const storageKey = "delaro.demo.initiatives";
const phases = ["Validation", "Design", "Build", "Test", "Deploy", "Measure"];

export function InitiativeList({ initialInitiatives, demoMode = false }: { initialInitiatives: Initiative[]; demoMode?: boolean }) {
  const [initiatives, setInitiatives] = useState(initialInitiatives);
  const [editing, setEditing] = useState<Initiative | null>(null);
  const [showForm, setShowForm] = useState(false);
  const dialogRef = useDialogFocus(showForm, () => setShowForm(false));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!demoMode) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try { setInitiatives(JSON.parse(saved) as Initiative[]); } catch { /* Ignore stale demo data. */ }
    }
  }, [demoMode]);

  function save(next: Initiative[]) {
    setInitiatives(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoMode) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const item: Initiative = {
      id: editing?.id ?? `initiative-${Date.now()}`,
      title: String(values.title), objective: String(values.objective), phase: String(values.phase),
      owner: String(values.owner), progress: Number(values.progress),
      nextMilestone: String(values.nextMilestone), status: String(values.status) as InitiativeStatus,
    };
    save(editing ? initiatives.map((current) => current.id === editing.id ? item : current) : [item, ...initiatives]);
    setEditing(null);
    setShowForm(false);
    setNotice(editing ? "Initiative updated." : "Initiative added to the demo workspace.");
    window.setTimeout(() => setNotice(null), 2600);
  }

  return <>
    <div className="initiative-toolbar">
      <div>{demoMode && <span className="demo-inline">Demo workspace · changes persist locally</span>}</div>
      {demoMode && <button className="primary-button" type="button" onClick={() => { setEditing(null); setShowForm(true); }}>Add initiative <span>→</span></button>}
    </div>
    <section className="initiative-list">{initiatives.map((initiative) => <article className="initiative-row" key={initiative.id}>
      <div className="initiative-main"><div className="initiative-title-row"><h3>{initiative.title}</h3><span className={`status ${initiative.status === "At risk" ? "status-at-risk" : ""}`}><span className="status-dot"/>{initiative.status === "At risk" ? "Needs attention" : initiative.status === "On track" ? "On track" : "Complete"}</span></div><p>{initiative.objective}</p></div>
      <div className="initiative-phase"><span>Stage</span><strong>{initiative.phase}</strong></div>
      <div className="initiative-progress"><div className="progress-label"><span>Progress</span><strong>{initiative.progress}%</strong></div><div className="progress-track"><span style={{ width: `${initiative.progress}%` }}/></div></div>
      <div className="initiative-next"><span>Next step</span><strong>{initiative.nextMilestone}</strong><small>Owner · {initiative.owner}</small></div>
      {demoMode && <button className="edit-button" type="button" onClick={() => { setEditing(initiative); setShowForm(true); }}>Edit initiative</button>}
    </article>)}</section>
    {demoMode && showForm && <div className="form-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><section ref={dialogRef} className="opportunity-form-panel" role="dialog" aria-modal="true" aria-labelledby="initiative-form-title"><div className="form-panel-header"><div><p className="eyebrow">Initiative details</p><h2 id="initiative-form-title">{editing ? "Edit initiative" : "Add initiative"}</h2></div><button className="close-button" type="button" onClick={() => setShowForm(false)} aria-label="Close form">×</button></div><form className="opportunity-form" onSubmit={submit}>
      <label>Name<input name="title" required autoFocus defaultValue={editing?.title ?? ""} placeholder="e.g. Capacity visibility"/></label>
      <label>What will change?<textarea name="objective" required minLength={10} defaultValue={editing?.objective ?? ""} placeholder="Describe the improvement in plain language."/></label>
      <div className="form-grid"><label>Stage<select name="phase" defaultValue={editing?.phase ?? "Validation"}>{phases.map((phase) => <option key={phase}>{phase}</option>)}</select></label><label>Status<select name="status" defaultValue={editing?.status ?? "On track"}><option>On track</option><option>At risk</option><option>Complete</option></select></label></div>
      <div className="form-grid"><label>Owner<input name="owner" required defaultValue={editing?.owner ?? ""}/></label><label>Progress · 0–100<input name="progress" type="number" min="0" max="100" defaultValue={editing?.progress ?? 0}/></label></div>
      <label>Next step<input name="nextMilestone" required defaultValue={editing?.nextMilestone ?? ""}/></label>
      <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit">Save initiative <span>→</span></button></div>
    </form></section></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </>;
}
