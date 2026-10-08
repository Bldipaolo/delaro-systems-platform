import { getInitiatives } from "@/lib/data/initiatives";
import { InitiativeList } from "@/components/initiatives/initiative-list";
import { requireInternalUserContext } from "@/lib/auth/context";
import { isSupabaseConfigured } from "@/lib/auth/context";

export default async function InternalInitiativesPage() {
  await requireInternalUserContext();
  const initiatives = await getInitiatives();

  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Deliver / interventions</p><h1>Improvements</h1><p className="intro-copy">The work currently moving from diagnosis into measurable change.</p></div></section><InitiativeList initialInitiatives={initiatives} demoMode={!isSupabaseConfigured()}/></main>;
}
