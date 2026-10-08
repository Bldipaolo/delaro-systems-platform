import { ImprovementsWorkspace } from "@/components/improvements/improvements-workspace";
import { getClientImprovements } from "@/lib/data/improvements";

export default async function ImprovementsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const improvements = await getClientImprovements();
  const requestedId = (await searchParams).id;
  const initialId = improvements.some((item) => item.id === requestedId) ? requestedId : improvements[0]?.id;
  return <ImprovementsWorkspace improvements={improvements} initialId={initialId}/>;
}
