export default function PortalLoading() {
  return <main className="content portal-loading" aria-busy="true" aria-label="Loading workspace">
    <div className="loading-line loading-title"/>
    <div className="loading-line loading-copy"/>
    <section className="loading-metrics" aria-hidden="true"><i/><i/><i/><i/></section>
    <div className="loading-line loading-section"/>
    <section className="loading-records" aria-hidden="true"><i/><i/><i/><i/></section>
  </main>;
}
