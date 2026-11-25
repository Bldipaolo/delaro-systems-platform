import { notFound } from "next/navigation";
import { WorkflowDetail } from "@/components/workflows/workflow-views";
import { getClientWorkflow } from "@/lib/data/workflow-observability";
import { isSupabaseConfigured } from "@/lib/auth/context";

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ workflowId: string }>; searchParams: Promise<{ page?: string }> }) {
  const page = Number.parseInt((await searchParams).page ?? "1", 10);
  const workflow = await getClientWorkflow((await params).workflowId, Number.isFinite(page) ? page : 1);
  if (!workflow) notFound();
  return <WorkflowDetail workflow={workflow} production={isSupabaseConfigured()}/>;
}
