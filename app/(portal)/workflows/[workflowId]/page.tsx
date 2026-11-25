import { notFound } from "next/navigation";
import { WorkflowDetail } from "@/components/workflows/workflow-views";
import { getClientWorkflow } from "@/lib/data/workflow-observability";
import { isSupabaseConfigured } from "@/lib/auth/context";
import { getClientEconomicImpact } from "@/lib/data/economic-impact";

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ workflowId: string }>; searchParams: Promise<{ page?: string }> }) {
  const page = Number.parseInt((await searchParams).page ?? "1", 10);
  const workflowId = (await params).workflowId;
  const [workflow, economic] = await Promise.all([
    getClientWorkflow(workflowId, Number.isFinite(page) ? page : 1),
    getClientEconomicImpact(),
  ]);
  if (!workflow) notFound();
  return <WorkflowDetail workflow={workflow} production={isSupabaseConfigured()} valueModels={economic.models.filter((model) => model.workflowIds?.includes(workflowId))}/>;
}
