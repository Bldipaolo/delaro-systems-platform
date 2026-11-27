import { ClientAttention } from "@/components/intelligence/client-attention";
import { getClientOperationalSignals } from "@/lib/data/operational-intelligence";

export default async function AttentionPage() {
  return <ClientAttention signals={await getClientOperationalSignals()}/>;
}
