import { notFound } from "next/navigation";
import { WorkflowDetail } from "@/components/workflows/workflow-views";
import { getClientWorkflow } from "@/lib/data/workflow-observability";
import { isSupabaseConfigured } from "@/lib/auth/context";

export default async function WorkflowPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const workflow = await getClientWorkflow((await params).workflowId);
  if (!workflow) notFound();
  return <WorkflowDetail workflow={workflow} production={isSupabaseConfigured()}/>;
}
