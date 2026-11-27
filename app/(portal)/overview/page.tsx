import { ClientOverview } from "@/components/dashboard/overview";
import { getClientOverview } from "@/lib/data/overview";
import { getClientDecisions } from "@/lib/data/decisions";
import { needsAttention } from "@/lib/decisions/types";
import { getClientOperationalActivity } from "@/lib/data/operational-events";
import { getClientWorkflows } from "@/lib/data/workflow-observability";
import { isSupabaseConfigured } from "@/lib/auth/context";
import { getClientOperationalSignals } from "@/lib/data/operational-intelligence";

export default async function OverviewPage() {
  const [overview, decisions, activity, workflows, signals] = await Promise.all([getClientOverview(), getClientDecisions(), getClientOperationalActivity(), getClientWorkflows(), getClientOperationalSignals({ limit: 6 })]);
  return <ClientOverview overview={overview} attention={decisions.filter(needsAttention)} activity={activity} workflows={workflows} signals={signals} production={isSupabaseConfigured()}/>;
}
