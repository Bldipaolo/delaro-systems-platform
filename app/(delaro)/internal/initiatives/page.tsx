import { getInitiatives } from "@/lib/data/initiatives";
import { InitiativeList } from "@/components/initiatives/initiative-list";

export default async function InternalInitiativesPage() {
  const initiatives = await getInitiatives();

  return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Internal Delaro workspace</p><h1>Initiatives</h1><p className="intro-copy">The work currently moving from diagnosis into measurable change.</p></div></section><InitiativeList initialInitiatives={initiatives}/></main>;
}
