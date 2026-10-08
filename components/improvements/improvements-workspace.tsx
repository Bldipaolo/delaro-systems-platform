"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientImprovement } from "@/lib/measurement/types";
import { formatMeasure, resultLabel } from "@/lib/measurement/format";

const missing = "Not shared yet";

export function ImprovementsWorkspace({ improvements, initialId }: { improvements: ClientImprovement[]; initialId?: string }) {
  const [selectedId, setSelectedId] = useState(initialId ?? improvements[0]?.id ?? "");
  const selected = improvements.find((item) => item.id === selectedId) ?? improvements[0];
  const leadMetric = selected?.metrics[0];

  return <main className="content intelligence-content">
    <header className="intelligence-header"><div><p className="intelligence-context">From operational constraint to measurable change</p><h1>Improvements</h1><p>Understand what is changing, why it matters, and how the result will be checked.</p></div><span>{improvements[0]?.demo ? "Northstar Manufacturing · Demo examples" : "Your organization · Shared improvements"}</span></header>
    {improvements.length === 0 ? <section className="intelligence-empty"><h2>No improvements shared yet</h2><p>When Delaro connects an improvement to your operation, its cause, intervention, and measurement plan will appear here.</p></section> :
      <div className="improvements-layout"><nav className="improvements-index" aria-label="Improvements"><div className="intelligence-index-title"><span>Work underway</span><span>{String(improvements.length).padStart(2, "0")}</span></div>{improvements.map((item) => <button type="button" key={item.id} className={`improvement-select ${selected?.id === item.id ? "is-selected" : ""}`} aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span>{item.currentPhase} · {item.status === "At risk" ? "Needs attention" : item.status}</span></button>)}</nav>
        {selected && <article className="improvement-detail"><div className="improvement-heading"><div><p>Improvement detail</p><h2>{selected.name}</h2><span>{selected.objective}</span></div><span className="improvement-phase">{selected.currentPhase}</span></div>
          <div className="improvement-meta"><div><span>Owner</span><strong>{selected.ownerName}</strong></div><div><span>Next milestone</span><strong>{selected.nextMilestone ?? "To be set"}</strong></div><div><span>Status</span><strong>{selected.status === "At risk" ? "Needs attention" : selected.status}</strong></div></div>
          <ol className="improvement-chain">
            <li><span className="improvement-chain-number">01</span><div><h3>Constraint</h3><p>{selected.linkedConstraint ?? missing}</p><dl><div><dt>Current-state problem</dt><dd>{selected.currentStateProblem ?? missing}</dd></div><div><dt>Root cause</dt><dd>{selected.rootCause ?? missing}</dd></div></dl>{selected.constraintId && <Link href="/operations" className="improvement-related-link">View the operations map ↗</Link>}</div></li>
            <li><span className="improvement-chain-number">02</span><div><h3>Business consequence</h3><p>{selected.businessConsequence ?? missing}</p></div></li>
            <li><span className="improvement-chain-number">03</span><div><h3>Intervention</h3><p>{selected.intervention ?? missing}</p><dl><div><dt>Processes</dt><dd>{selected.linkedProcesses.length ? selected.linkedProcesses.join(" · ") : "Not linked yet"}</dd></div><div><dt>Systems</dt><dd>{selected.linkedSystems.length ? selected.linkedSystems.join(" · ") : "Not linked yet"}</dd></div></dl></div></li>
            <li><span className="improvement-chain-number">04</span><div><h3>Implementation</h3><p>{selected.implementation ?? missing}</p><span className="improvement-stage-note">Current phase · {selected.currentPhase}</span></div></li>
            <li><span className="improvement-chain-number">05</span><div><h3>Measurement</h3><p>{selected.measurementPlan ?? "Measurement plan pending"}</p>{leadMetric && <div className="improvement-measure-strip"><div><span>Baseline</span><strong>{formatMeasure(leadMetric.baselineValue, leadMetric.unit)}</strong><small>{leadMetric.baselineStatus === "verified" ? "Verified" : "Evidence pending"}</small></div><div><span>Expected</span><strong>{formatMeasure(leadMetric.targetValue, leadMetric.unit)}</strong><small>Target</small></div><div><span>Current</span><strong>{formatMeasure(leadMetric.currentValue, leadMetric.unit)}</strong><small>{resultLabel(leadMetric)}</small></div></div>}</div></li>
            <li><span className="improvement-chain-number">06</span><div><h3>Result</h3><p>{leadMetric?.currentValue !== null && leadMetric?.currentValue !== undefined ? `${formatMeasure(leadMetric.currentValue, leadMetric.unit)} verified against source evidence.` : "A verified result has not been recorded yet."}</p><div className="improvement-expected"><span>Expected result</span><strong>{selected.expectedResult ?? "To be defined"}</strong></div><Link href={leadMetric ? `/impact?id=${encodeURIComponent(leadMetric.id)}` : "/impact"} className="improvement-related-link">See all impact measures ↗</Link></div></li>
          </ol>
        </article>}
      </div>}
  </main>;
}
