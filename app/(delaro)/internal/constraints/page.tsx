import Link from "next/link";
import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalOperationalModel } from "@/lib/data/operational-model";
import { demoOperationalModel } from "@/lib/operational-model/demo";
import { publishConstraint, saveConstraint, saveConstraintDiagnostic } from "./actions";

export default async function InternalConstraintsPage() {
  const context = await requireInternalUserContext();
  const model = context ? await getInternalOperationalModel() : { ...demoOperationalModel, diagnostics: [], teamMembers: [] };
  return <InternalPage stage="Diagnose / friction" title="Constraints" description="Record observed friction privately. Publish only reviewed, client-safe summaries." demo={!context}>
    {context && model.processes.length > 0 && <DataSection title="New constraint"><details className="pilot-editor"><summary>Record a constraint</summary>
      <form action={saveConstraint} className="pilot-form"><input type="hidden" name="id" value=""/>
        <label>Process<select name="processId">{model.processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}</select></label>
        <label>Issue<input name="issueDescription" minLength={5} required/></label>
        <label>Severity<select name="severity" defaultValue="medium">{["low", "medium", "high", "critical"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Frequency<select name="frequency" defaultValue="occasional">{["rare", "occasional", "frequent", "continuous"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <input type="hidden" name="status" value="open"/><button type="submit">Save draft constraint</button>
      </form></details></DataSection>}
    <DataSection title={`Diagnosed constraints · ${model.constraints.length}`} empty="No constraints recorded yet.">{model.constraints.map((constraint) => {
      const process = model.processes.find((item) => item.id === constraint.processId);
      const diagnostic = model.diagnostics.find((item) => item.constraintId === constraint.id);
      const publication = model.publications.find((item) => item.constraintId === constraint.id);
      const opportunity = model.opportunitySummaries.find((item) => item.id === publication?.opportunitySummaryId);
      return <div key={constraint.id}><DataRow title={constraint.issueDescription} subtitle={diagnostic?.businessConsequence ?? publication?.businessConsequenceSummary ?? "Business consequence not recorded"} values={[
        { label: "Process", value: process?.name ?? "Unlinked" }, { label: "Severity", value: constraint.severity },
        { label: "Frequency", value: constraint.frequency }, { label: "Status", value: constraint.status },
        { label: "Client view", value: constraint.clientVisible ? "Published" : "Draft" },
        { label: "Root cause", value: diagnostic?.rootCause ?? "Pending" },
        { label: "Opportunity", value: diagnostic?.opportunityId || opportunity ? <Link href="/opportunities">{opportunity?.title ?? "Open opportunity"} →</Link> : "Not yet linked" },
      ]}/>
      {context && <div className="pilot-editors">
        <details className="pilot-editor"><summary>Edit constraint</summary><form action={saveConstraint} className="pilot-form">
          <input type="hidden" name="id" value={constraint.id}/>
          <label>Process<select name="processId" defaultValue={constraint.processId ?? ""}>{model.processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Issue<input name="issueDescription" defaultValue={constraint.issueDescription} required/></label>
          <label>Severity<select name="severity" defaultValue={constraint.severity}>{["low", "medium", "high", "critical"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Frequency<select name="frequency" defaultValue={constraint.frequency}>{["rare", "occasional", "frequent", "continuous"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Status<select name="status" defaultValue={constraint.status}>{["open", "investigating", "planned", "resolved"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="submit">Save constraint</button></form></details>
        <details className="pilot-editor"><summary>Private diagnosis</summary><form action={saveConstraintDiagnostic} className="pilot-form">
          <input type="hidden" name="constraintId" value={constraint.id}/>
          <label>Root cause<textarea name="rootCause" defaultValue={diagnostic?.rootCause ?? ""}/></label>
          <label>Business consequence<textarea name="businessConsequence" defaultValue={diagnostic?.businessConsequence ?? ""}/></label>
          <label>Internal notes<textarea name="internalNotes" defaultValue={diagnostic?.internalNotes ?? ""}/></label>
          <label>Linked opportunity<select name="opportunityId" defaultValue={diagnostic?.opportunityId ?? ""}><option value="">None</option>{model.opportunitySummaries.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <button type="submit">Save diagnosis</button></form></details>
        <details className="pilot-editor"><summary>Client publication</summary><form action={publishConstraint} className="pilot-form">
          <input type="hidden" name="constraintId" value={constraint.id}/>
          <label>Client-safe root cause<textarea name="rootCauseSummary" defaultValue={publication?.rootCauseSummary ?? ""}/></label>
          <label>Client-safe consequence<textarea name="businessConsequenceSummary" defaultValue={publication?.businessConsequenceSummary ?? ""}/></label>
          <label>Visibility<select name="publish" defaultValue={constraint.clientVisible ? "yes" : "no"}><option value="no">Internal draft</option><option value="yes">Publish to client</option></select></label>
          <button type="submit">Save publication</button></form></details>
      </div>}
      </div>;
    })}</DataSection>
  </InternalPage>;
}
