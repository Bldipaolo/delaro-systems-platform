"use client";

import { useEffect, useMemo, useState } from "react";
import { useDialogFocus } from "@/components/layout/use-dialog-focus";

type DocumentItem = { id: string; title: string; type: string; date: string; description: string; status: "Ready" | "Draft" };

const seedDocuments: DocumentItem[] = [
  { id: "doc-diagnostic", title: "What we found", type: "Summary", date: "6 Oct 2026", description: "A plain-language summary of what we observed and the improvements selected for the first cycle.", status: "Ready" },
  { id: "doc-handoff", title: "Quote-to-order handoff map", type: "Process map", date: "3 Oct 2026", description: "A working map of how an approved order moves into production planning, including the questions still to answer.", status: "Draft" },
  { id: "doc-review", title: "Next review agenda", type: "Review agenda", date: "17 Oct 2026", description: "The progress, questions, and choices prepared for the next review.", status: "Ready" },
];

const storageKey = "delaro.demo.documents";

export function DocumentHub() {
  const [documents, setDocuments] = useState<DocumentItem[]>(seedDocuments);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) setDocuments((parsed as DocumentItem[]).map((item) => ({ ...item, type: item.type === "Project plan" ? "Process map" : item.type === "Check-in" ? "Review agenda" : item.type })));
    } catch { /* Invalid local demo data falls back to the examples. */ }
  }, []);
  const [filter, setFilter] = useState("All files");
  const [selectedId, setSelectedId] = useState(seedDocuments[0].id);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useDialogFocus(showForm, () => setShowForm(false));
  const filtered = useMemo(() => filter === "All files" ? documents : documents.filter((document) => document.type === filter), [documents, filter]);
  const selected = filtered.find((document) => document.id === selectedId) ?? filtered[0];

  function save(next: DocumentItem[]) { setDocuments(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); }
  function addDocument(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const item: DocumentItem = { id: `doc-${Date.now()}`, title: String(values.title), type: String(values.type), date: "Today", description: String(values.description), status: "Draft" }; save([item, ...documents]); setSelectedId(item.id); setShowForm(false); setNotice("Demo record added. No file was uploaded."); }

  return <>
    <div className="hub-toolbar"><span className="demo-inline">Demo records only · no attachments stored</span><div className="hub-toolbar-actions"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter files"><option>All files</option><option>Summary</option><option>Process map</option><option>Review agenda</option></select><button className="primary-button" type="button" onClick={() => setShowForm(true)}>Add demo record <span>→</span></button></div></div>
    <div className="document-layout"><section className="document-list" aria-label="Files">{filtered.map((document) => <button className={`document-row ${selected?.id === document.id ? "document-row-active" : ""}`} key={document.id} type="button" aria-pressed={selected?.id === document.id} onClick={() => setSelectedId(document.id)}><span className="document-type">{document.type}</span><span className="document-row-main"><strong>{document.title}</strong><small>{document.date}</small></span><span className={`document-status document-status-${document.status.toLowerCase()}`}>{document.status}</span></button>)}{filtered.length === 0 && <p className="document-preview-note">No records in this category.</p>}</section>{selected && <aside className="document-detail"><span className="eyebrow">{selected.type}</span><h2>{selected.title}</h2><p>{selected.description}</p><div className="detail-meta"><span>Last updated</span><strong>{selected.date}</strong></div><p className="document-preview-note">No attachment is available in this demo record.</p></aside>}</div>
    {showForm && <div className="form-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><section ref={dialogRef} className="opportunity-form-panel" role="dialog" aria-modal="true" aria-labelledby="document-form-title"><div className="form-panel-header"><div><p className="eyebrow">Demo record</p><h2 id="document-form-title">Add a record</h2></div><button className="close-button" type="button" onClick={() => setShowForm(false)} aria-label="Close form">×</button></div><form className="opportunity-form" onSubmit={addDocument}><p className="document-preview-note">This adds a local description, not a file attachment.</p><label>Name<input name="title" required autoFocus placeholder="e.g. Measurement plan" /></label><label>Type<select name="type" defaultValue="Process map"><option>Summary</option><option>Process map</option><option>Review agenda</option></select></label><label>What is it about?<textarea name="description" required minLength={10} placeholder="Describe what this record helps the team understand." /></label><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit">Add record <span>→</span></button></div></form></section></div>}{notice && <button className="toast" type="button" onClick={() => setNotice("")} role="status">{notice}</button>}
  </>;
}
