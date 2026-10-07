import { getOpportunities } from "@/lib/data/opportunities";
import { OpportunityPipeline } from "@/components/opportunities/opportunity-pipeline";

export default async function OpportunitiesPage() {
  const opportunities = await getOpportunities();
  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Internal Delaro workspace</p><h1>Opportunity pipeline</h1><p className="intro-copy">Evidence-led opportunities, scored for judgment and ready to move through qualification.</p></div></section><OpportunityPipeline initialOpportunities={opportunities}/></main>;
}
