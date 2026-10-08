import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalMeasurement } from "@/lib/data/internal-measurement";
import { reviewEvidence } from "./actions";

function safeDocumentUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}

export default async function EvidencePage() {
  const context = await requireInternalUserContext();
  const { evidence } = await getInternalMeasurement();
  const pending = evidence.filter((item) => item.verification_status !== "verified");
  const verified = evidence.filter((item) => item.verification_status === "verified");
  const render = (item: typeof evidence[number]) => <DataRow key={`${item.kind}-${item.id}`} title={item.source_reference ?? item.description ?? "Unlabeled source"} subtitle={item.description ?? item.subject} values={[{ label: "Supports", value: `${item.kind} · ${item.subject}` }, { label: "Type", value: item.source_type }, { label: "State", value: item.verification_status }, { label: "Client view", value: item.client_visible ? "Visible when verified" : "Internal" }, { label: "Source", value: safeDocumentUrl(item.document_url) ? <a href={safeDocumentUrl(item.document_url)!} target="_blank" rel="noopener noreferrer">Open document ↗</a> : "Reference only" }, { label: "Review", value: context && item.verification_status !== "verified" && item.verification_status !== "rejected" ? <form action={reviewEvidence} className="methodology-inline-form"><input type="hidden" name="kind" value={item.kind}/><input type="hidden" name="id" value={item.id}/><button type="submit" name="outcome" value="verified">Verify</button><button type="submit" name="outcome" value="rejected">Reject</button></form> : "—" }]} />;
  return <InternalPage stage="Measure / source record" title="Evidence" description="Source material behind measurement and value claims. Pending records cannot establish verified results." demo={!context}>
    <DataSection title={`Needs verification · ${pending.length}`} empty="No evidence awaiting verification.">{pending.map(render)}</DataSection>
    <DataSection title={`Verified sources · ${verified.length}`} empty="No verified evidence yet.">{verified.map(render)}</DataSection>
  </InternalPage>;
}
