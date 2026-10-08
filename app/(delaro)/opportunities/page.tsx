import { getOpportunities } from "@/lib/data/opportunities";
import { OpportunityPipeline } from "@/components/opportunities/opportunity-pipeline";
import { isSupabaseConfigured, requireInternalUserContext } from "@/lib/auth/context";
import { demoOverview } from "@/lib/domain";

export default async function OpportunitiesPage() {
  const context = await requireInternalUserContext();
  const opportunities = await getOpportunities();
  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Internal Delaro workspace</p><h1>Opportunity pipeline</h1><p className="intro-copy">Evidence-led opportunities, scored for judgment and ready to move through qualification.</p></div></section><OpportunityPipeline initialOpportunities={opportunities} organizationName={context?.organization.name ?? demoOverview.organizationName} demoMode={!isSupabaseConfigured()}/></main>;
}
