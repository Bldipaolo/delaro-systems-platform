"use client";

import { useState } from "react";

type Measure = { id: string; name: string; unit: string; baseline: string; expected: string; actual: string; owner: string; status: "Pending" | "Tracking" | "Verified" };
const seedMeasures: Measure[] = [
  { id: "measure-cycle", name: "Quote-to-order cycle time", unit: "days", baseline: "8.4", expected: "5.5", actual: "—", owner: "Maya Chen", status: "Tracking" },
  { id: "measure-rework", name: "Rework cost at source", unit: "$ / month", baseline: "—", expected: "—", actual: "—", owner: "Elliot Stone", status: "Pending" },
  { id: "measure-capacity", name: "Capacity plan confidence", unit: "%", baseline: "62", expected: "90", actual: "—", owner: "Jordan Davis", status: "Pending" },
];
const storageKey = "delaro.demo.measures";

export function PerformanceDashboard() {
  const [measures, setMeasures] = useState<Measure[]>(() => { if (typeof window === "undefined") return seedMeasures; const saved = window.localStorage.getItem(storageKey); return saved ? JSON.parse(saved) as Measure[] : seedMeasures; });
  const [selectedId, setSelectedId] = useState(measures[0].id);
  const [notice, setNotice] = useState("");
  const selected = measures.find((measure) => measure.id === selectedId) ?? measures[0];
  function updateActual(value: string) { const next = measures.map((measure) => measure.id === selected.id ? { ...measure, actual: value || "—", status: value ? ("Tracking" as const) : ("Pending" as const) } : measure); setMeasures(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); setNotice("Measure updated in the demo workspace."); }
  return <>
    <div className="hub-toolbar"><span className="demo-inline">Demo workspace · verified values are intentionally blank</span><button className="secondary-button" type="button" onClick={() => setNotice("Results are ready to connect to verified data later.")}>How results are counted <span>→</span></button></div>
    <section className="performance-summary"><div><span>Results we are tracking</span><strong>{measures.length.toString().padStart(2, "0")}</strong><small>Across projects underway</small></div><div><span>In progress</span><strong>{measures.filter((measure) => measure.status === "Tracking").length.toString().padStart(2, "0")}</strong><small>Waiting for updated results</small></div><div><span>Confirmed impact</span><strong>—</strong><small>We will add this when verified</small></div></section>
    <div className="performance-layout"><section className="measure-list" aria-label="Results">{measures.map((measure) => <button type="button" className={`measure-row ${selected?.id === measure.id ? "measure-row-active" : ""}`} key={measure.id} onClick={() => setSelectedId(measure.id)}><span className="measure-row-main"><strong>{measure.name}</strong><small>{measure.owner} · {measure.unit}</small></span><span className="measure-values"><span>{measure.baseline}</span><span>{measure.expected}</span><span>{measure.actual}</span></span><span className={`measure-status measure-status-${measure.status.toLowerCase()}`}>{measure.status === "Tracking" ? "In progress" : measure.status === "Pending" ? "Not started" : "Verified"}</span></button>)}</section>{selected && <aside className="measure-detail"><span className="eyebrow">How we will know</span><h2>{selected.name}</h2><p>We will compare where things started with the expected result, then add a verified actual when the evidence is ready.</p><div className="measure-grid"><div><span>Started at</span><strong>{selected.baseline}</strong></div><div><span>Expected</span><strong>{selected.expected}</strong></div><div><span>Now</span><strong>{selected.actual}</strong></div></div><label className="actual-input">Add current result<input defaultValue={selected.actual === "—" ? "" : selected.actual} placeholder={`Value in ${selected.unit}`} onBlur={(event) => updateActual(event.target.value)} /></label><small className="field-hint">Press Tab or click away to save the demo value.</small></aside>}</div>{notice && <button className="toast" type="button" onClick={() => setNotice("")} role="status">{notice}</button>}
  </>;
}
