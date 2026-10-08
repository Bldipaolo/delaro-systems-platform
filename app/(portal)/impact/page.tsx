import { ImpactWorkspace } from "@/components/impact/impact-workspace";
import { getClientImpact } from "@/lib/data/impact";
import { getClientEconomicImpact } from "@/lib/data/economic-impact";

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const [metrics, economic] = await Promise.all([getClientImpact(), getClientEconomicImpact()]);
  const requestedId = (await searchParams).id;
  const initialId = metrics.some((item) => item.id === requestedId) ? requestedId : metrics[0]?.id;
  return <ImpactWorkspace metrics={metrics} initialId={initialId} valueModels={economic.models} economicSummary={economic.summary}/>;
}
