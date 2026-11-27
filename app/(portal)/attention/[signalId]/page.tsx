import { notFound } from "next/navigation";
import { ClientSignalDetail } from "@/components/intelligence/client-attention";
import { getClientOperationalSignalDetail } from "@/lib/data/operational-intelligence";

export default async function SignalDetailPage({ params }: { params: Promise<{ signalId: string }> }) {
  const { signalId } = await params;
  const detail = await getClientOperationalSignalDetail(signalId);
  if (!detail) notFound();
  return <ClientSignalDetail signal={detail.signal} history={detail.history}/>;
}
