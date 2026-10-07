"use client";

import { useState } from "react";

const reviews = [
  { date: "17 Oct 2026", title: "Next check-in", status: "Upcoming", summary: "Look at what has changed, answer the open questions, and agree on the next step.", decisions: ["Choose who will provide the source data", "Confirm the next step"] },
  { date: "18 Jul 2026", title: "Starting point", status: "Complete", summary: "Agreed on the three areas where a clearer process could make the biggest difference.", decisions: ["Start the quote-to-order project", "Agree how to see capacity clearly"] },
];

export function ReviewHub() {
  const [expanded, setExpanded] = useState(0);
  const [notice, setNotice] = useState("");
  return <><div className="review-hero"><div><span className="eyebrow">Stay aligned</span><h2>Keep progress and next steps clear.</h2><p>Use each check-in to look at what changed, answer open questions, and agree on what happens next.</p></div><div className="review-date"><span>Next check-in</span><strong>17 Oct 2026</strong><small>Northstar Manufacturing · 60 min</small></div></div><section className="review-timeline" aria-label="Check-in history">{reviews.map((review, index) => <article className={`review-item ${expanded === index ? "review-item-open" : ""}`} key={review.title}><button type="button" className="review-summary" onClick={() => setExpanded(expanded === index ? -1 : index)}><span className="review-marker">{index === 0 ? "→" : "✓"}</span><span><small>{review.date} · {review.status}</small><strong>{review.title}</strong><em>{review.summary}</em></span><span className="review-toggle">{expanded === index ? "−" : "+"}</span></button>{expanded === index && <div className="review-details"><span className="eyebrow">Questions to answer</span>{review.decisions.map((decision) => <label key={decision}><input type="checkbox" onChange={() => setNotice("Your checklist was updated in demo mode.")} />{decision}</label>)}<button className="secondary-button" type="button" onClick={() => setNotice("Your note is ready for the shared record.")}>Add a note <span>→</span></button></div>}</article>)}</section>{notice && <button className="toast" type="button" onClick={() => setNotice("")} role="status">{notice}</button>}</>;
}
