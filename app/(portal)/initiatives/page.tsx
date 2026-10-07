import { getInitiatives } from "@/lib/data/initiatives";
import { InitiativeList } from "@/components/initiatives/initiative-list";

export default async function InitiativesPage() {
  const initiatives = await getInitiatives();
  return <main className="content"><section className="page-intro compact"><div><p className="eyebrow">Work in progress</p><h1>Projects</h1><p className="intro-copy">See the work underway, who owns the next step, and how far along it is.</p></div></section><InitiativeList initialInitiatives={initiatives}/></main>;
}
