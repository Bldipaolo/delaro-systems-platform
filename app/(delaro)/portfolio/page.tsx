import Link from "next/link";
import { requireInternalUserContext } from "@/lib/auth/context";
import { demoOverview } from "@/lib/domain";
import { getInternalOperationalActivity } from "@/lib/data/operational-events";

export default async function PortfolioPage() {
  const context = await requireInternalUserContext();
  const organizationName = context?.organization.name ?? demoOverview.organizationName;
  const industry = context?.organization.industry ?? demoOverview.organizationIndustry;
  const activity = await getInternalOperationalActivity();
  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Delaro portfolio</p><h1>Portfolio</h1><p className="intro-copy">A working view of the client systems currently moving through diagnosis, implementation, and measurement.</p></div></section><section className="internal-grid"><article className="internal-panel"><span className="eyebrow">Active client</span><h2>{organizationName}</h2><p>{industry || "Industry not recorded"}{!context && " · Demo example"}</p><div className="internal-panel-meta"><span>Engagement status</span><strong>{context?.organization.status ?? "Demo"}</strong></div></article><article className="internal-panel"><span className="eyebrow">Attention</span><h2>{activity.exceptions.length} open {activity.exceptions.length === 1 ? "exception" : "exceptions"}</h2><p>Operational issues currently requiring follow-up for {organizationName}.</p><Link className="secondary-button" href="/internal/exceptions">Review exceptions <span>→</span></Link></article></section></main>;
}
