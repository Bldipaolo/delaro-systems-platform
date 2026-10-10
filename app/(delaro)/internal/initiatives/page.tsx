import { getInitiatives } from "@/lib/data/initiatives";
import { InitiativeList } from "@/components/initiatives/initiative-list";
import { requireInternalUserContext } from "@/lib/auth/context";
import { isSupabaseConfigured } from "@/lib/auth/context";
import { getOpportunities } from "@/lib/data/opportunities";
import { createClient } from "@/lib/supabase/server";
import { createInitiativeFromForm, updateInitiativeFromForm } from "../../initiatives/actions";

export default async function InternalInitiativesPage() {
  const context = await requireInternalUserContext();
  const initiatives = await getInitiatives();
  const opportunities = context ? await getOpportunities() : [];
  const client = context ? await createClient() : null;
  const records = client ? await client.from("initiatives")
    .select("id,title,objective,current_phase,status,next_milestone,client_visible_summary,client_visible")
    .eq("organization_id", context!.organization.id).order("updated_at", { ascending: false }) : null;
  if (records?.error) throw new Error("Unable to load improvement drafts.");

  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Deliver / interventions</p><h1>Improvements</h1><p className="intro-copy">The work currently moving from diagnosis into measurable change.</p></div></section><InitiativeList initialInitiatives={initiatives} demoMode={!isSupabaseConfigured()}/>
    {context && <section className="methodology-section"><div className="section-heading"><h2>Internal workflow</h2></div>
      <details className="pilot-editor"><summary>Create a private improvement</summary><form action={createInitiativeFromForm} className="pilot-form">
        <label>Linked opportunity<select name="opportunityId" defaultValue=""><option value="">None yet</option>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Name<input name="title" minLength={3} required/></label><label>Objective<textarea name="objective" minLength={10} required/></label>
        <label>Internal scope<textarea name="scope"/></label>
        <label>Phase<select name="currentPhase" defaultValue="Validation">{["Validation","Design","Build","Test","Deploy","Measure"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Target date<input name="targetLaunchDate" type="date"/></label>
        <label>Client-safe summary<textarea name="clientVisibleSummary"/></label>
        <button type="submit">Create draft improvement</button>
      </form></details>
      {(records?.data ?? []).map((item) => <details className="pilot-editor" key={item.id}><summary>{item.title} · {item.client_visible ? "Published" : "Draft"}</summary><form action={updateInitiativeFromForm} className="pilot-form">
        <input type="hidden" name="id" value={item.id}/>
        <label>Name<input name="title" defaultValue={item.title} minLength={3} required/></label>
        <label>Objective<textarea name="objective" defaultValue={item.objective} minLength={10} required/></label>
        <label>Phase<select name="currentPhase" defaultValue={item.current_phase}>{["Validation","Design","Build","Test","Deploy","Measure"].map((phase) => <option key={phase}>{phase}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={item.status}>{["On track","At risk","Complete"].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Next milestone<input name="nextMilestone" defaultValue={item.next_milestone ?? ""}/></label>
        <label>Client-safe summary<textarea name="clientVisibleSummary" defaultValue={item.client_visible_summary ?? ""}/></label>
        <label className="pilot-check"><input name="clientVisible" type="checkbox" defaultChecked={item.client_visible}/> Publish reviewed improvement</label>
        <button type="submit">Save improvement</button>
      </form></details>)}
    </section>}
  </main>;
}
