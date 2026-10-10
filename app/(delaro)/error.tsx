"use client";

export default function InternalError({ reset }: { error: Error; reset: () => void }) {
  return <main className="content internal-content"><section className="empty-state" role="alert">
    <p className="eyebrow">Internal workspace unavailable</p><h1>This record could not be loaded.</h1>
    <p>No change was made. Retry, then check server logs if the issue persists.</p>
    <button className="primary-button" type="button" onClick={reset}>Try again</button>
  </section></main>;
}
