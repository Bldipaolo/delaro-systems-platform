import { WorkflowsOverview } from "@/components/workflows/workflow-views";
import { getClientWorkflows } from "@/lib/data/workflow-observability";
import { isSupabaseConfigured } from "@/lib/auth/context";

export default async function WorkflowsPage() {
  return <WorkflowsOverview workflows={await getClientWorkflows()} production={isSupabaseConfigured()}/>;
}
