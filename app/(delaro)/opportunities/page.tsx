import { getOpportunities } from "@/lib/data/opportunities";
import { OpportunityPipeline } from "@/components/opportunities/opportunity-pipeline";
import { isSupabaseConfigured, requireInternalUserContext } from "@/lib/auth/context";
import { demoOverview } from "@/lib/domain";
import { createOpportunityFromForm, publishOpportunitySummary, updateOpportunityStatus } from "./actions";
import { createClient } from "@/lib/supabase/server";

export default async function OpportunitiesPage() {
  const context = await requireInternalUserContext();
  const opportunities = await getOpportunities();
  const client = context ? await createClient() : null;
  const summaries = client ? await client.from("opportunity_client_summaries").select("opportunity_id,title,summary")
    .eq("organization_id", context!.organization.id) : null;
  if (summaries?.error) throw new Error("Unable to load published opportunity summaries.");
  const summaryByOpportunity = new Map((summaries?.data ?? []).map((row) => [row.opportunity_id, row]));
  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Internal Delaro workspace</p><h1>Opportunity pipeline</h1><p className="intro-copy">Evidence-led opportunities, scored for judgment and ready to move through qualification.</p></div></section><OpportunityPipeline initialOpportunities={opportunities} organizationName={context?.organization.name ?? demoOverview.organizationName} demoMode={!isSupabaseConfigured()}/>
    {context && <section className="methodology-section"><div className="section-heading"><h2>Internal workflow</h2></div>
      <details className="pilot-editor"><summary>Record an opportunity</summary><form action={createOpportunityFromForm} className="pilot-form">
        <label>Title<input name="title" minLength={3} required/></label>
        <label>Department or process<input name="process" minLength={2} required/></label>
        <label>Current-state problem<textarea name="currentStateProblem" minLength={10} required/></label>
        <label>Root cause<textarea name="rootCause"/></label>
        <label>Business consequence<textarea name="businessConsequence" minLength={10} required/></label>
        <label>Estimated annual exposure, if supported<input name="estimatedAnnualValue" type="number" min="0" step="0.01" placeholder="Leave blank if unknown"/></label>
        <label>Evidence quality<select name="evidenceQuality" defaultValue="Low"><option>Low</option><option>Medium</option><option>High</option></select></label>
        <p>Internal diagnostic scores · 1–5</p>
        {["financialImpact","frequency","addressability","measurementQuality","strategicLeverage","implementationDifficulty","organizationalComplexity","risk"].map((name) => <label key={name}>{name.replace(/([A-Z])/g, " $1")}<input name={name} type="number" min="1" max="5" defaultValue="3" required/></label>)}
        <button type="submit">Save private opportunity</button>
      </form></details>
      {opportunities.map((opportunity) => <details className="pilot-editor" key={opportunity.id}><summary>{opportunity.title} · {opportunity.status} · {summaryByOpportunity.has(opportunity.id) ? "Summary published" : "Internal"}</summary>
        <form action={updateOpportunityStatus} className="pilot-form"><input type="hidden" name="id" value={opportunity.id}/><label>Stage<select name="status" defaultValue={opportunity.status}>{["Investigate","Qualified","Prioritized","Proposed","Approved","Implementing","Measuring","Complete","Rejected"].map((status) => <option key={status}>{status}</option>)}</select></label><button type="submit">Save stage</button></form>
        <form action={publishOpportunitySummary} className="pilot-form"><input type="hidden" name="opportunityId" value={opportunity.id}/><label>Client title<input name="title" defaultValue={summaryByOpportunity.get(opportunity.id)?.title ?? opportunity.title} minLength={3} required/></label><label>Client-safe summary<textarea name="summary" defaultValue={summaryByOpportunity.get(opportunity.id)?.summary ?? ""} minLength={10} required/></label><button type="submit">Publish reviewed summary</button></form>
      </details>)}
    </section>}
  </main>;
}
