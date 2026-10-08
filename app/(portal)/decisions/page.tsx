import { DecisionWorkspace } from "@/components/decisions/decision-workspace";
import { getClientDecisions } from "@/lib/data/decisions";

export default async function DecisionsPage() {
  return <DecisionWorkspace decisions={await getClientDecisions()}/>;
}
