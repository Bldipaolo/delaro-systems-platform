import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalOperationalModel } from "@/lib/data/operational-model";
import { demoOperationalModel } from "@/lib/operational-model/demo";
import Link from "next/link";

export default async function InternalConstraintsPage() {
  const context = await requireInternalUserContext();
  const model = context ? await getInternalOperationalModel() : { ...demoOperationalModel, diagnostics: [], teamMembers: [] };
  return <InternalPage stage="Diagnose / friction" title="Constraints" description="Review observed friction and its consequence before promoting it to an opportunity. Internal diagnostic notes stay here." demo={!context}>
    <DataSection title={`Diagnosed constraints · ${model.constraints.length}`} empty="No constraints recorded yet.">{model.constraints.map((constraint) => {
      const process = model.processes.find((item) => item.id === constraint.processId);
      const diagnostic = model.diagnostics.find((item) => item.constraintId === constraint.id);
      const publication = model.publications.find((item) => item.constraintId === constraint.id);
      const opportunity = model.opportunitySummaries.find((item) => item.id === publication?.opportunitySummaryId);
      return <DataRow key={constraint.id} title={constraint.issueDescription} subtitle={diagnostic?.businessConsequence ?? publication?.businessConsequenceSummary ?? "Business consequence not recorded"} values={[{ label: "Process", value: process?.name ?? "Unlinked" }, { label: "Severity", value: constraint.severity }, { label: "Frequency", value: constraint.frequency }, { label: "Status", value: constraint.status }, { label: "Root cause", value: diagnostic?.rootCause ?? publication?.rootCauseSummary ?? "Pending" }, { label: "Opportunity", value: diagnostic?.opportunityId || opportunity ? <Link href="/opportunities">{opportunity?.title ?? "Open opportunity"} →</Link> : "Not yet linked" }]} />;
    })}</DataSection>
  </InternalPage>;
}
