import Link from "next/link";

const reviews = [
  { date: "17 Oct 2026", title: "Next check-in", status: "Upcoming", summary: "Review what changed and confirm next steps. Any approval or question stays in Decisions." },
  { date: "18 Jul 2026", title: "Starting point", status: "Complete", summary: "Agreed on the areas where a clearer process could make the biggest difference." },
];

export function ReviewHub({ organizationName }: { organizationName: string }) {
  return <><div className="review-hero"><div><span className="eyebrow">Shared record</span><h2>A history of progress and next steps.</h2><p>Check-ins capture what was discussed. Questions and approvals that need your response live in Decisions.</p><Link href="/decisions" className="text-link">Open decisions →</Link></div><div className="review-date"><span>Next check-in</span><strong>17 Oct 2026</strong><small>{organizationName} · Demo schedule</small></div></div><section className="review-timeline" aria-label="Check-in records">{reviews.map((review) => <article className="review-item" key={review.title}><div className="review-summary"><span className="review-marker">{review.status === "Upcoming" ? "→" : "✓"}</span><span><small>{review.date} · {review.status} · Demo example</small><strong>{review.title}</strong><em>{review.summary}</em></span></div></article>)}</section></>;
}
