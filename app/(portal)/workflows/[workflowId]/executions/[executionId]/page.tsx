import { notFound } from "next/navigation";
import { WorkflowExecutionDetail } from "@/components/workflows/workflow-views";
import { getClientWorkflowExecution } from "@/lib/data/workflow-observability";

export default async function WorkflowExecutionPage({ params }: { params: Promise<{ workflowId: string; executionId: string }> }) {
  const { workflowId, executionId } = await params;
  const record = await getClientWorkflowExecution(workflowId, executionId);
  if (!record) notFound();
  return <WorkflowExecutionDetail workflow={record.workflow} execution={record.execution}/>;
}
