"use client";

import { useMemo, useState } from "react";

type DocumentItem = { id: string; title: string; type: string; date: string; description: string; status: "Ready" | "Draft" };

const seedDocuments: DocumentItem[] = [
  { id: "doc-diagnostic", title: "What we found", type: "Summary", date: "6 Oct 2026", description: "A plain-language summary of what we observed and the projects selected for the first improvement cycle.", status: "Ready" },
  { id: "doc-handoff", title: "Quote-to-order handoff map", type: "Project plan", date: "3 Oct 2026", description: "A working map of how an approved order moves into production planning, including the questions still to answer.", status: "Draft" },
  { id: "doc-review", title: "Next check-in agenda", type: "Check-in", date: "17 Oct 2026", description: "The progress, questions, and choices prepared for the next check-in.", status: "Ready" },
];

const storageKey = "delaro.demo.documents";

export function DocumentHub() {
  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    if (typeof window === "undefined") return seedDocuments;
    const saved = window.localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) as DocumentItem[] : seedDocuments;
  });
  const [filter, setFilter] = useState("All files");
  const [selectedId, setSelectedId] = useState(seedDocuments[0].id);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => filter === "All files" ? documents : documents.filter((document) => document.type === filter), [documents, filter]);
  const selected = documents.find((document) => document.id === selectedId) ?? filtered[0];

  function save(next: DocumentItem[]) { setDocuments(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); }
  function addDocument(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const item: DocumentItem = { id: `doc-${Date.now()}`, title: String(values.title), type: String(values.type), date: "Today", description: String(values.description), status: "Draft" }; save([item, ...documents]); setSelectedId(item.id); setShowForm(false); setNotice("Document added to the demo record."); }

  return <>
    <div className="hub-toolbar"><span className="demo-inline">Demo workspace · changes persist locally</span><div className="hub-toolbar-actions"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter files"><option>All files</option><option>Summary</option><option>Project plan</option><option>Check-in</option></select><button className="primary-button" type="button" onClick={() => setShowForm(true)}>Add file <span>→</span></button></div></div>
    <div className="document-layout"><section className="document-list" aria-label="Files">{filtered.map((document) => <button className={`document-row ${selected?.id === document.id ? "document-row-active" : ""}`} key={document.id} type="button" onClick={() => setSelectedId(document.id)}><span className="document-type">{document.type}</span><span className="document-row-main"><strong>{document.title}</strong><small>{document.date}</small></span><span className={`document-status document-status-${document.status.toLowerCase()}`}>{document.status}</span></button>)}</section>{selected && <aside className="document-detail"><span className="eyebrow">{selected.type}</span><h2>{selected.title}</h2><p>{selected.description}</p><div className="detail-meta"><span>Last updated</span><strong>{selected.date}</strong></div><button className="secondary-button" type="button" onClick={() => setNotice("Preview mode: file viewer will connect later.")}>Open preview <span>↗</span></button></aside>}</div>
    {showForm && <div className="form-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><section className="opportunity-form-panel" role="dialog" aria-modal="true" aria-labelledby="document-form-title"><div className="form-panel-header"><div><p className="eyebrow">Shared files</p><h2 id="document-form-title">Add file</h2></div><button className="close-button" type="button" onClick={() => setShowForm(false)} aria-label="Close form">×</button></div><form className="opportunity-form" onSubmit={addDocument}><label>Name<input name="title" required placeholder="e.g. Measurement plan" /></label><label>Type<select name="type" defaultValue="Project plan"><option>Summary</option><option>Project plan</option><option>Check-in</option></select></label><label>What is it about?<textarea name="description" required minLength={10} placeholder="Describe what this file helps the team understand." /></label><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit">Add file <span>→</span></button></div></form></section></div>}{notice && <button className="toast" type="button" onClick={() => setNotice("")} role="status">{notice}</button>}
  </>;
}
