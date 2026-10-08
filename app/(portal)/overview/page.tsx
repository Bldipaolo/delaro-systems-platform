import { ClientOverview } from "@/components/dashboard/overview";
import { getClientOverview } from "@/lib/data/overview";
import { getClientDecisions } from "@/lib/data/decisions";
import { needsAttention } from "@/lib/decisions/types";
import { getClientOperationalActivity } from "@/lib/data/operational-events";

export default async function OverviewPage() {
  const [overview, decisions, activity] = await Promise.all([getClientOverview(), getClientDecisions(), getClientOperationalActivity()]);
  return <ClientOverview overview={overview} attention={decisions.filter(needsAttention)} activity={activity}/>;
}
