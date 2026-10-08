import { OperationsWorkspace } from "@/components/operations/operations-workspace";
import { isSupabaseConfigured } from "@/lib/auth/context";
import { getClientOperationalModel } from "@/lib/data/operational-model";
import { demoOperationalModel } from "@/lib/operational-model/demo";

export default async function OperationsPage() {
  const demoMode = !isSupabaseConfigured();
  const model = demoMode ? demoOperationalModel : await getClientOperationalModel();
  return <OperationsWorkspace model={model} demoMode={demoMode}/>;
}
