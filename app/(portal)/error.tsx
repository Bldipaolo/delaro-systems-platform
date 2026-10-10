"use client";

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return <main className="content"><section className="empty-state" role="alert">
    <p className="eyebrow">Workspace unavailable</p><h1>We could not load this page.</h1>
    <p>Your data has not been changed. Try again; if this continues, contact Delaro.</p>
    <button className="primary-button" type="button" onClick={reset}>Try again</button>
  </section></main>;
}
