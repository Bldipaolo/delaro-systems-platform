import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalOperationalModel } from "@/lib/data/operational-model";
import { demoOperationalModel } from "@/lib/operational-model/demo";
import type { OperatingProcess, OperatingSystem, ProcessStep } from "@/lib/operational-model/types";
import { saveOperationalArea, saveOperatingProcess, saveOperatingSystem, saveProcessStep } from "./actions";

const stepTypes = ["input", "process", "decision", "action", "output"] as const;
const modes = ["manual", "assisted", "automated"] as const;

function ProcessForm({ process, areas }: { process?: OperatingProcess; areas: { id: string; name: string }[] }) {
  return <form action={saveOperatingProcess} className="pilot-form">
    <input type="hidden" name="id" value={process?.id ?? ""}/>
    <label>Area<select name="operationalAreaId" defaultValue={process?.operationalAreaId} required>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
    <label>Name<input name="name" defaultValue={process?.name} minLength={2} required/></label>
    <label>Description<textarea name="description" defaultValue={process?.description ?? ""}/></label>
    <label>Trigger<textarea name="triggerDescription" defaultValue={process?.triggerDescription ?? ""}/></label>
    <label>Expected output<textarea name="expectedOutput" defaultValue={process?.expectedOutput ?? ""}/></label>
    <label>Downstream effect<textarea name="downstreamEffect" defaultValue={process?.downstreamEffect ?? ""}/></label>
    <label>Status<select name="status" defaultValue={process?.status ?? "draft"}>{["draft", "active", "paused", "retired"].map((status) => <option key={status}>{status}</option>)}</select></label>
    {process && <label className="pilot-check"><input name="clientVisible" type="checkbox" defaultChecked={process.clientVisible}/> Publish reviewed process to client</label>}
    <button type="submit">{process ? "Save process" : "Create draft process"}</button>
  </form>;
}

function StepForm({ step, processId }: { step?: ProcessStep; processId: string }) {
  return <form action={saveProcessStep} className="pilot-form">
    <input type="hidden" name="id" value={step?.id ?? ""}/><input type="hidden" name="processId" value={processId}/>
    <label>Step type<select name="stepType" defaultValue={step?.stepType ?? "input"}>{stepTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label>Name<input name="name" defaultValue={step?.name} minLength={2} required/></label>
    <label>Description<textarea name="description" defaultValue={step?.description ?? ""}/></label>
    <label>Order<input name="sortOrder" type="number" min="0" defaultValue={step?.sortOrder ?? 0} required/></label>
    <label>Mode<select name="automationMode" defaultValue={step?.automationMode ?? "manual"}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
    <label className="pilot-check"><input name="approvalRequired" type="checkbox" defaultChecked={step?.approvalRequired}/> Approval required</label>
    {step && <label className="pilot-check"><input name="clientVisible" type="checkbox" defaultChecked={step.clientVisible}/> Publish reviewed step</label>}
    <button type="submit">{step ? "Save step" : "Add draft step"}</button>
  </form>;
}

function SystemForm({ system }: { system?: OperatingSystem }) {
  return <form action={saveOperatingSystem} className="pilot-form">
    <input type="hidden" name="id" value={system?.id ?? ""}/>
    <label>Name<input name="name" defaultValue={system?.name} minLength={2} required/></label>
    <label>Category<input name="category" defaultValue={system?.category ?? ""}/></label>
    <label>Vendor<input name="vendor" defaultValue={system?.vendor ?? ""}/></label>
    <label>Description<textarea name="description" defaultValue={system?.description ?? ""}/></label>
    <label>Integration<select name="integrationStatus" defaultValue={system?.integrationStatus ?? "unknown"}>{["unknown", "not_integrated", "planned", "partial", "integrated"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
    <label className="pilot-check"><input name="systemOfRecord" type="checkbox" defaultChecked={system?.systemOfRecord}/> System of record</label>
    {system && <label className="pilot-check"><input name="clientVisible" type="checkbox" defaultChecked={system.clientVisible}/> Publish reviewed system</label>}
    <button type="submit">{system ? "Save system" : "Add system"}</button>
  </form>;
}

export default async function InternalOperationsPage() {
  const context = await requireInternalUserContext();
  const model = context ? await getInternalOperationalModel() : demoOperationalModel;
  return <InternalPage stage="Diagnose / operating model" title="Operations" description="Map the operation privately, then publish reviewed processes, steps and systems to the client." demo={!context}>
    {context && <DataSection title="Add to the operating model">
      <details className="pilot-editor"><summary>New operational area</summary><form action={saveOperationalArea} className="pilot-form"><label>Name<input name="name" minLength={2} required/></label><label>Description<textarea name="description"/></label><button type="submit">Add area</button></form></details>
      {model.areas.length > 0 && <details className="pilot-editor"><summary>New process</summary><ProcessForm areas={model.areas}/></details>}
      <details className="pilot-editor"><summary>New system</summary><SystemForm/></details>
    </DataSection>}
    <DataSection title={`Processes · ${model.processes.length}`} empty="No processes mapped yet.">{model.areas.map((area) => <div key={area.id} className="methodology-subsection"><h3>{area.name}</h3>{model.processes.filter((process) => process.operationalAreaId === area.id).map((process) => <div key={process.id}>
      <DataRow title={process.name} subtitle={process.triggerDescription} values={[{ label: "Status", value: process.status }, { label: "Steps", value: model.steps.filter((step) => step.processId === process.id).length }, { label: "Client map", value: process.clientVisible ? "Published" : "Draft" }]}/>
      {context && <details className="pilot-editor"><summary>Edit process and publication</summary><ProcessForm process={process} areas={model.areas}/></details>}
      <div className="pilot-step-list">{model.steps.filter((step) => step.processId === process.id).sort((a, b) => a.sortOrder - b.sortOrder).map((step) => <div key={step.id}>
        <p>{step.sortOrder + 1}. {step.name} · {step.stepType} · {step.clientVisible ? "Published" : "Draft"}</p>
        {context && <details className="pilot-editor"><summary>Edit step</summary><StepForm step={step} processId={process.id}/></details>}
      </div>)}</div>
      {context && <details className="pilot-editor"><summary>Add step</summary><StepForm processId={process.id}/></details>}
    </div>)}</div>)}</DataSection>
    <DataSection title={`Systems · ${model.systems.length}`} empty="No systems mapped yet.">{model.systems.map((system) => <div key={system.id}><DataRow title={system.name} subtitle={system.description} values={[{ label: "Category", value: system.category ?? "Unspecified" }, { label: "Integration", value: system.integrationStatus.replaceAll("_", " ") }, { label: "Client map", value: system.clientVisible ? "Published" : "Draft" }]}/>{context && <details className="pilot-editor"><summary>Edit system</summary><SystemForm system={system}/></details>}</div>)}</DataSection>
  </InternalPage>;
}
