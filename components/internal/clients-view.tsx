import Link from "next/link";

export function ClientsView({ organizationName, industry, status, demo }: { organizationName: string; industry: string; status: string; demo: boolean }) {
  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Engagement context</p><h1>Clients</h1><p className="intro-copy">The active client workspace and its operating model.</p></div></section><section className="internal-table"><div className="internal-table-head"><span>Organization</span><span>Industry</span><span>Workspace</span><span>Status</span></div><Link className="internal-table-row" href="/internal/operations"><strong>{organizationName}{demo && <small className="demo-inline">Demo</small>}</strong><span>{industry || "Not recorded"}</span><span>Open operating model →</span><span className="status">{status}</span></Link></section></main>;
}
