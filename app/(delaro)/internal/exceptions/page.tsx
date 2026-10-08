import Link from "next/link";
import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalOperationalActivity } from "@/lib/data/operational-events";

export default async function ExceptionsPage() {
  const context = await requireInternalUserContext();
  const activity = await getInternalOperationalActivity();
  return <InternalPage stage="Deliver / intervention" title="Exceptions" description="Operational issues requiring follow-up, with the event record retained for technical investigation." demo={!context}>
    <DataSection title={`Open exceptions · ${activity.exceptions.length}`} empty="No open exceptions recorded.">{activity.exceptions.map((item) => <DataRow key={item.id} title={item.title} subtitle={item.summary} values={[{ label: "Severity", value: item.severity }, { label: "Status", value: item.status.replaceAll("_", " ") }, { label: "Occurred", value: new Date(item.occurredAt).toLocaleDateString("en-US") }, { label: "Decision", value: item.decisionId ? <Link href="/decisions">Open decision →</Link> : "None linked" }]} />)}</DataSection>
    <p className="methodology-footnote"><Link href="/internal/activity">Inspect the technical event record →</Link></p>
  </InternalPage>;
}
