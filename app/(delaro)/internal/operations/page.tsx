import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalOperationalModel } from "@/lib/data/operational-model";
import { getClientAdministration } from "@/lib/data/client-administration";
import { demoOperationalModel } from "@/lib/operational-model/demo";
import type { OperatingProcess, OperatingSystem, ProcessStep } from "@/lib/operational-model/types";
import { linkProcessSystem, linkStepSystem, saveDataAsset, saveHandoff, saveOperationalArea, saveOperationalPerson, saveOperationalTeam, saveOperatingProcess, saveOperatingSystem, saveProcessDependency, saveProcessStep, saveStepDependency } from "./actions";

const stepTypes = ["input", "process", "decision", "action", "output"] as const;
const modes = ["manual", "assisted", "automated"] as const;

function ProcessForm({ process, areas, teams }: { process?: OperatingProcess; areas: { id: string; name: string }[]; teams: { id: string; name: string }[] }) {
  return <form action={saveOperatingProcess} className="pilot-form">
    <input type="hidden" name="id" value={process?.id ?? ""}/>
    <label>Area<select name="operationalAreaId" defaultValue={process?.operationalAreaId} required>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
    <label>Name<input name="name" defaultValue={process?.name} minLength={2} required/></label>
    <label>Description<textarea name="description" defaultValue={process?.description ?? ""}/></label>
    <label>Owner team<select name="ownerTeamId" defaultValue={process?.ownerTeamId ?? ""}><option value="">Not assigned</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label>Order<input name="sortOrder" type="number" min="0" defaultValue={process?.sortOrder ?? 0}/></label>
    <label>Trigger<textarea name="triggerDescription" defaultValue={process?.triggerDescription ?? ""}/></label>
    <label>Expected output<textarea name="expectedOutput" defaultValue={process?.expectedOutput ?? ""}/></label>
    <label>Downstream effect<textarea name="downstreamEffect" defaultValue={process?.downstreamEffect ?? ""}/></label>
    <label>Status<select name="status" defaultValue={process?.status ?? "draft"}>{["draft", "active", "paused", "retired"].map((status) => <option key={status}>{status}</option>)}</select></label>
    {process && <label className="pilot-check"><input name="clientVisible" type="checkbox" defaultChecked={process.clientVisible}/> Publish reviewed process to client</label>}
    <button type="submit">{process ? "Save process" : "Create draft process"}</button>
  </form>;
}

function StepForm({ step, processId, teams }: { step?: ProcessStep; processId: string; teams: { id: string; name: string }[] }) {
  return <form action={saveProcessStep} className="pilot-form">
    <input type="hidden" name="id" value={step?.id ?? ""}/><input type="hidden" name="processId" value={processId}/>
    <label>Step type<select name="stepType" defaultValue={step?.stepType ?? "input"}>{stepTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label>Name<input name="name" defaultValue={step?.name} minLength={2} required/></label>
    <label>Description<textarea name="description" defaultValue={step?.description ?? ""}/></label>
    <label>Order<input name="sortOrder" type="number" min="0" defaultValue={step?.sortOrder ?? 0} required/></label>
    <label>Mode<select name="automationMode" defaultValue={step?.automationMode ?? "manual"}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
    <label>Owner team<select name="ownerTeamId" defaultValue={step?.ownerTeamId ?? ""}><option value="">Not assigned</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label>Expected minutes<input name="expectedDurationMinutes" type="number" min="0" step="any" defaultValue={step?.expectedDurationMinutes ?? ""}/></label>
    <label>Observed minutes<input name="actualDurationMinutes" type="number" min="0" step="any" defaultValue={step?.actualDurationMinutes ?? ""}/></label>
    <label>Decision or approval criteria<textarea name="decisionCriteria" defaultValue={step?.decisionCriteria ?? ""}/></label>
    <label>Internal notes<textarea name="notes" defaultValue={step?.notes ?? ""}/></label>
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
  const administration = context ? await getClientAdministration() : null;
  return <InternalPage stage="Diagnose / operating model" title="Operations" description="Map the operation privately, then publish reviewed processes, steps and systems to the client." demo={!context}>
    {context && <DataSection title="Add to the operating model">
      <details className="pilot-editor"><summary>New operational area</summary><form action={saveOperationalArea} className="pilot-form"><label>Name<input name="name" minLength={2} required/></label><label>Description<textarea name="description"/></label><button type="submit">Add area</button></form></details>
      {model.areas.length > 0 && <details className="pilot-editor"><summary>New process</summary><ProcessForm areas={model.areas} teams={model.teams}/></details>}
      <details className="pilot-editor"><summary>New system</summary><SystemForm/></details>
      <details className="pilot-editor"><summary>New team</summary><form action={saveOperationalTeam} className="pilot-form"><label>Name<input name="name" required/></label><label>Description<textarea name="description"/></label><label>Order<input name="sortOrder" type="number" min="0" defaultValue="0"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed team</label><button type="submit">Add team</button></form></details>
      {(administration?.memberships.length ?? 0) > 0 && <details className="pilot-editor"><summary>Add responsible person</summary><form action={saveOperationalPerson} className="pilot-form"><label>Organization member<select name="membershipId">{administration!.memberships.filter((member) => member.status === "active").map((member) => <option key={member.id} value={member.id}>{member.fullName ?? member.email}</option>)}</select></label><label>Display name<input name="displayName" required/></label><label>Role or title<input name="title"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed identity</label><button type="submit">Add operating role</button></form></details>}
      <details className="pilot-editor"><summary>New data source</summary><form action={saveDataAsset} className="pilot-form"><label>System<select name="systemId"><option value="">Not system-specific</option>{model.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label><label>Name<input name="name" required/></label><label>Category<input name="category"/></label><label>Format<input name="dataFormat"/></label><label>Description<textarea name="description"/></label><label>Source and movement<textarea name="sourceDescription"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed data source</label><button type="submit">Add data source</button></form></details>
    </DataSection>}
    <DataSection title={`Processes · ${model.processes.length}`} empty="No processes mapped yet.">{model.areas.map((area) => <div key={area.id} className="methodology-subsection"><h3>{area.name}</h3>{model.processes.filter((process) => process.operationalAreaId === area.id).map((process) => <div key={process.id}>
      <DataRow title={process.name} subtitle={process.triggerDescription} values={[{ label: "Status", value: process.status }, { label: "Steps", value: model.steps.filter((step) => step.processId === process.id).length }, { label: "Client map", value: process.clientVisible ? "Published" : "Draft" }]}/>
      {context && <details className="pilot-editor"><summary>Edit process and publication</summary><ProcessForm process={process} areas={model.areas} teams={model.teams}/></details>}
      <div className="pilot-step-list">{model.steps.filter((step) => step.processId === process.id).sort((a, b) => a.sortOrder - b.sortOrder).map((step) => <div key={step.id}>
        <p>{step.sortOrder + 1}. {step.name} · {step.stepType} · {step.clientVisible ? "Published" : "Draft"}</p>
        {context && <details className="pilot-editor"><summary>Edit step</summary><StepForm step={step} processId={process.id} teams={model.teams}/></details>}
      </div>)}</div>
      {context && <details className="pilot-editor"><summary>Add step</summary><StepForm processId={process.id} teams={model.teams}/></details>}
    </div>)}</div>)}</DataSection>
    <DataSection title={`Systems · ${model.systems.length}`} empty="No systems mapped yet.">{model.systems.map((system) => <div key={system.id}><DataRow title={system.name} subtitle={system.description} values={[{ label: "Category", value: system.category ?? "Unspecified" }, { label: "Integration", value: system.integrationStatus.replaceAll("_", " ") }, { label: "Client map", value: system.clientVisible ? "Published" : "Draft" }]}/>{context && <details className="pilot-editor"><summary>Edit system</summary><SystemForm system={system}/></details>}</div>)}</DataSection>
    {context && <DataSection title="Relationships and flow">
      {model.processes.length > 0 && model.systems.length > 0 && <details className="pilot-editor"><summary>Link system to process</summary><form action={linkProcessSystem} className="pilot-form"><label>Process<select name="processId">{model.processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>System<select name="systemId">{model.systems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Role in process<input name="usageRole"/></label><label>Internal notes<textarea name="notes"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed relationship</label><button type="submit">Link system</button></form></details>}
      {model.steps.length > 0 && model.systems.length > 0 && <details className="pilot-editor"><summary>Link system to step</summary><form action={linkStepSystem} className="pilot-form"><label>Step<select name="stepId">{model.steps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>System<select name="systemId">{model.systems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Role at step<input name="usageRole"/></label><label>Internal notes<textarea name="notes"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed relationship</label><button type="submit">Link system</button></form></details>}
      {model.steps.length > 1 && <details className="pilot-editor"><summary>Record handoff</summary><form action={saveHandoff} className="pilot-form"><label>Source step<select name="sourceStepId">{model.steps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Destination step<select name="destinationStepId">{model.steps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Information transferred<textarea name="informationTransferred" required/></label><label>Method<input name="handoffMethod"/></label><label>Known delay · minutes<input name="delayMinutes" type="number" min="0" step="any"/></label><label>Known failure rate · %<input name="failureRatePercent" type="number" min="0" max="100" step="any"/></label><label>Internal notes<textarea name="notes"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed handoff</label><button type="submit">Save handoff</button></form></details>}
      {model.processes.length > 1 && <details className="pilot-editor"><summary>Connect process dependency</summary><form action={saveProcessDependency} className="pilot-form"><label>Upstream process<select name="upstreamProcessId">{model.processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Downstream process<select name="downstreamProcessId">{model.processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Condition<textarea name="conditionDescription"/></label><label>Internal notes<textarea name="notes"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed dependency</label><button type="submit">Connect processes</button></form></details>}
      {model.steps.length > 1 && <details className="pilot-editor"><summary>Connect step dependency</summary><form action={saveStepDependency} className="pilot-form"><label>Upstream step<select name="upstreamStepId">{model.steps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Downstream step<select name="downstreamStepId">{model.steps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Condition<textarea name="conditionDescription"/></label><label>Internal notes<textarea name="notes"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish reviewed dependency</label><button type="submit">Connect steps</button></form></details>}
      <div className="relationship-ledger"><p>{model.processSystems.length} process–system links · {model.stepSystems.length} step–system links</p><p>{model.handoffs.length} handoffs · {model.processDependencies.length + model.stepDependencies.length} dependencies</p><p>{model.dataAssets.length} data sources · {model.teams.length} teams · {model.people.length} responsible people</p></div>
    </DataSection>}
  </InternalPage>;
}
