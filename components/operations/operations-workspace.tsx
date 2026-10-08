"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientOperationalModel, OperatingProcess, ProcessConstraint, ProcessStep } from "@/lib/operational-model/types";

const stepLabels: Record<ProcessStep["stepType"], string> = {
  input: "Input", process: "Process", decision: "Decision", action: "Action", output: "Output",
};

function duration(minutes: number | null) {
  if (minutes === null) return "Not measured";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Number((minutes % 60).toFixed(2));
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function joined(items: string[], empty = "Not yet mapped") {
  return items.length ? items.join(" · ") : empty;
}

function constraintsForProcess(model: ClientOperationalModel, processId: string): ProcessConstraint[] {
  const stepIds = new Set(model.steps.filter((step) => step.processId === processId).map((step) => step.id));
  const systemIds = new Set([
    ...model.processSystems.filter((link) => link.processId === processId).map((link) => link.systemId),
    ...model.stepSystems.filter((link) => stepIds.has(link.stepId)).map((link) => link.systemId),
  ]);
  return model.constraints.filter((constraint) => constraint.processId === processId
    || (constraint.stepId !== null && stepIds.has(constraint.stepId))
    || (constraint.processId === null && constraint.stepId === null && constraint.systemId !== null && systemIds.has(constraint.systemId)));
}

export function OperationsWorkspace({ model, demoMode }: { model: ClientOperationalModel; demoMode: boolean }) {
  const [selectedProcessId, setSelectedProcessId] = useState(() => model.processes.find((process) => process.id === "order-handoff")?.id ?? model.processes[0]?.id ?? "");
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(() => constraintsForProcess(model, model.processes.find((process) => process.id === "order-handoff")?.id ?? model.processes[0]?.id ?? "")[0]?.id ?? null);
  const selectedProcess = model.processes.find((process) => process.id === selectedProcessId);
  const selectedSteps = model.steps.filter((step) => step.processId === selectedProcessId).sort((a, b) => a.sortOrder - b.sortOrder);
  const stepIds = new Set(selectedSteps.map((step) => step.id));
  const selectedConstraints = constraintsForProcess(model, selectedProcessId);
  const selectedConstraint = selectedConstraints.find((item) => item.id === selectedConstraintId) ?? null;
  const area = model.areas.find((item) => item.id === selectedProcess?.operationalAreaId);
  const teamName = (id: string | null) => model.teams.find((team) => team.id === id)?.name ?? (id ? "Assigned member" : "Not assigned");
  const personName = (membershipId: string | null) => model.people.find((person) => person.membershipId === membershipId)?.displayName;
  const stepName = (id: string | null) => model.steps.find((step) => step.id === id)?.name ?? "Outside this map";
  const processName = (id: string) => model.processes.find((process) => process.id === id)?.name ?? "Related process";
  const systems = [...new Set([
    ...model.processSystems.filter((item) => item.processId === selectedProcessId).map((item) => item.systemId),
    ...model.stepSystems.filter((item) => stepIds.has(item.stepId)).map((item) => item.systemId),
  ])].map((id) => model.systems.find((system) => system.id === id)?.name).filter((name): name is string => Boolean(name));
  const dataLinks = model.stepData.filter((item) => stepIds.has(item.stepId));
  const dataNames = (direction: "input" | "output") => [...new Set(dataLinks.filter((item) => item.direction === direction).map((item) => model.dataAssets.find((asset) => asset.id === item.dataAssetId)?.name).filter((name): name is string => Boolean(name)))];
  const participants = [...new Set(selectedSteps.map((step) => personName(step.ownerMembershipId) ?? (step.ownerTeamId ? teamName(step.ownerTeamId) : step.ownerMembershipId ? "Assigned member" : null)).filter((label): label is string => Boolean(label)))];
  const handoffs = model.handoffs.filter((item) => (item.sourceStepId && stepIds.has(item.sourceStepId)) || (item.destinationStepId && stepIds.has(item.destinationStepId)));
  const dependencies = model.processDependencies.filter((item) => item.upstreamProcessId === selectedProcessId || item.downstreamProcessId === selectedProcessId);
  const stepDependencies = model.stepDependencies.filter((item) => (item.upstreamStepId && stepIds.has(item.upstreamStepId)) || (item.downstreamStepId && stepIds.has(item.downstreamStepId)));
  const metrics = model.metrics.filter((item) => item.processId === selectedProcessId);
  const publication = model.publications.find((item) => item.constraintId === selectedConstraint?.id);
  const opportunity = model.opportunitySummaries.find((item) => item.id === publication?.opportunitySummaryId);
  const improvement = model.improvements.find((item) => item.id === publication?.initiativeId);

  function chooseProcess(process: OperatingProcess) {
    setSelectedProcessId(process.id);
    setSelectedConstraintId(constraintsForProcess(model, process.id)[0]?.id ?? null);
  }

  return <main className="content operations-content">
    <header className="operations-header">
      <div>
        <p className="operations-kicker">A view of how work moves</p>
        <h1>Operations</h1>
        <p className="operations-intro">See the work behind the outcome—where it begins, how decisions are made, and what happens next.</p>
      </div>
      <div className="operations-header-note"><span>{demoMode ? "Northstar Manufacturing · Demo map" : "Your organization · Shared map"}</span><strong>{model.processes.length} processes across {model.areas.length} areas</strong><Link href="/activity" className="text-link">View operational activity →</Link></div>
    </header>

    {model.processes.length === 0 ? <div className="operations-empty"><h2>No processes mapped yet</h2><p>Once Delaro maps your operation, its areas, steps, constraints, and measures will appear here.</p></div> :
      <div className="operations-layout">
        <aside className="operations-index" aria-label="Operational areas and processes">
          <div className="operations-index-heading"><span>Operational areas</span><span>{String(model.areas.length).padStart(2, "0")}</span></div>
          {model.areas.map((item) => {
            const areaProcesses = model.processes.filter((process) => process.operationalAreaId === item.id).sort((a, b) => a.sortOrder - b.sortOrder);
            if (!areaProcesses.length) return null;
            return <section className="operations-area" key={item.id} aria-labelledby={`area-${item.id}`}>
              <div className="operations-area-heading"><h2 id={`area-${item.id}`}>{item.name}</h2><span>{String(areaProcesses.length).padStart(2, "0")}</span></div>
              <ul>{areaProcesses.map((process) => {
                const count = constraintsForProcess(model, process.id).length;
                return <li key={process.id}><button type="button" className={`operations-process-link ${process.id === selectedProcessId ? "is-selected" : ""}`} aria-pressed={process.id === selectedProcessId} onClick={() => chooseProcess(process)}><span>{process.name}</span>{count > 0 && <span className="operations-issue-count" aria-label={`${count} known constraints`}>{count}</span>}</button></li>;
              })}</ul>
            </section>;
          })}
        </aside>

        {selectedProcess && <div className="operations-main">
          <div className="operations-process-heading"><div><p>{area?.name ?? "Operational area"} <span aria-hidden="true">/</span> Process map</p><h2>{selectedProcess.name}</h2><span className="operations-process-description">{selectedProcess.description ?? `${selectedProcess.triggerDescription ?? "Work begins"} → ${selectedProcess.expectedOutput ?? "an expected output"}`}</span></div><span className="operations-process-status">{selectedProcess.status}</span></div>
          <div className="operations-reading-layout">
            <section className="operations-map" aria-label={`${selectedProcess.name} process flow`}>
              <div className="operations-map-heading"><h3>How the work moves</h3><span>{selectedSteps.length} mapped steps</span></div>
              <div className="operations-flow">
                <div className="operations-flow-row operations-flow-boundary"><span className="operations-flow-index">Start</span><div><span className="operations-flow-type">Trigger</span><strong>{selectedProcess.triggerDescription ?? "Trigger not yet mapped"}</strong></div></div>
                {selectedSteps.map((step, index) => {
                  const stepConstraints = selectedConstraints.filter((constraint) => constraint.stepId === step.id);
                  return <div className={`operations-flow-row ${stepConstraints.length ? "has-constraint" : ""}`} key={step.id}>
                    <span className="operations-flow-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="operations-flow-content"><div className="operations-flow-meta"><span className="operations-flow-type">{stepLabels[step.stepType]}</span><span>{step.automationMode === "automated" ? "Automated" : step.automationMode === "assisted" ? "Assisted" : "Manual"}</span></div><strong>{step.name}</strong>{step.description && <p>{step.description}</p>}{step.decisionCriteria && <p className="operations-decision-rule">Decision rule: {step.decisionCriteria}</p>}{step.actualDurationMinutes !== null && step.expectedDurationMinutes !== null && step.actualDurationMinutes > step.expectedDurationMinutes && <p className="operations-step-timing">Observed {duration(step.actualDurationMinutes)} · expected {duration(step.expectedDurationMinutes)}</p>}{step.approvalRequired && <span className="operations-approval">Approval required</span>}{stepConstraints.map((constraint) => <button className="operations-inline-constraint" type="button" key={constraint.id} onClick={() => setSelectedConstraintId(constraint.id)} aria-label={`View constraint: ${constraint.issueDescription}`}><span aria-hidden="true">◇</span> Constraint · {constraint.issueDescription}</button>)}</div>
                  </div>;
                })}
                <div className="operations-flow-row operations-flow-boundary"><span className="operations-flow-index">End</span><div><span className="operations-flow-type">Downstream effect</span><strong>{selectedProcess.downstreamEffect ?? "Downstream effect not yet mapped"}</strong></div></div>
              </div>
            </section>

            <aside className="operations-detail" aria-label="Process details">
              <section className="operations-detail-section"><h3>Process details</h3><dl className="operations-facts"><div><dt>Owner</dt><dd>{personName(selectedProcess.ownerMembershipId) ?? (selectedProcess.ownerTeamId ? teamName(selectedProcess.ownerTeamId) : selectedProcess.ownerMembershipId ? "Assigned member" : "Not assigned")}</dd></div><div><dt>Participants</dt><dd>{joined(participants)}</dd></div><div><dt>Systems involved</dt><dd>{joined(systems)}</dd></div><div><dt>Data required</dt><dd>{joined(dataNames("input"))}</dd></div><div><dt>Data generated</dt><dd>{joined(dataNames("output"))}</dd></div><div><dt>Manual steps</dt><dd>{selectedSteps.filter((step) => step.automationMode === "manual").length} of {selectedSteps.length}</dd></div><div><dt>Approvals</dt><dd>{joined(selectedSteps.filter((step) => step.approvalRequired).map((step) => step.name), "None mapped")}</dd></div></dl></section>
              <section className="operations-detail-section"><h3>Handoffs & dependencies</h3>{handoffs.length ? <ul className="operations-detail-list">{handoffs.map((handoff) => <li key={handoff.id}><strong>{handoff.informationTransferred}</strong><span>{teamName(handoff.sourceTeamId)} → {teamName(handoff.destinationTeamId)}</span><small>{handoff.handoffMethod ?? "Method not mapped"}{handoff.delayMinutes !== null ? ` · ${duration(handoff.delayMinutes)} delay` : ""}{handoff.failureRatePercent !== null ? ` · ${handoff.failureRatePercent}% failure rate` : ""}</small></li>)}</ul> : <p className="operations-unmapped">No handoffs mapped.</p>}{dependencies.length > 0 && <p className="operations-dependency">Connected processes: {joined(dependencies.map((item) => processName(item.upstreamProcessId === selectedProcessId ? item.downstreamProcessId : item.upstreamProcessId)))}</p>}{stepDependencies.length > 0 && <p className="operations-dependency">Step dependencies: {stepDependencies.length} mapped</p>}</section>
              <section className="operations-detail-section"><h3>Delays & failure points</h3><p className="operations-detail-copy">{handoffs.some((item) => item.delayMinutes !== null) ? `${handoffs.filter((item) => item.delayMinutes !== null).length} measured handoff delay${handoffs.filter((item) => item.delayMinutes !== null).length === 1 ? "" : "s"}.` : "No handoff delay measured yet."} {selectedConstraints.length} known constraint{selectedConstraints.length === 1 ? "" : "s"}.</p></section>
              <section className="operations-detail-section"><h3>Linked measures</h3>{metrics.length ? <ul className="operations-metric-list">{metrics.map((metric) => <li key={metric.id}><span>{metric.name}</span><strong>{metric.actualValue ?? "—"}<small>{metric.unit}</small></strong><small>Target {metric.targetValue ?? "—"} {metric.unit}</small></li>)}</ul> : <p className="operations-unmapped">No measures linked yet.</p>}</section>
            </aside>
          </div>

          <section className="operations-constraints" aria-labelledby="operations-constraints-title"><div className="operations-constraints-heading"><h3 id="operations-constraints-title">Known constraints</h3><span>{String(selectedConstraints.length).padStart(2, "0")}</span></div>
            {selectedConstraints.length ? <div className="operations-constraint-layout"><div className="operations-constraint-list">{selectedConstraints.map((constraint: ProcessConstraint) => <button key={constraint.id} type="button" className={`operations-constraint-item ${constraint.id === selectedConstraintId ? "is-selected" : ""}`} onClick={() => setSelectedConstraintId(constraint.id)} aria-pressed={constraint.id === selectedConstraintId}><span className="operations-constraint-mark" aria-hidden="true">◇</span><span><strong>{constraint.issueDescription}</strong><small>{constraint.severity} severity · {constraint.frequency}</small></span><span aria-hidden="true">↗</span></button>)}</div>
              <div className="operations-constraint-inspector" aria-live="polite">{selectedConstraint ? <><div className="operations-constraint-title"><span>Constraint detail</span><strong>{selectedConstraint.status}</strong></div><h4>{selectedConstraint.issueDescription}</h4><dl><div><dt>Root cause</dt><dd>{publication?.rootCauseSummary ?? "Not shared yet"}</dd></div><div><dt>Business consequence</dt><dd>{publication?.businessConsequenceSummary ?? "Not shared yet"}</dd></div><div><dt>Frequency</dt><dd>{selectedConstraint.frequency}</dd></div><div><dt>Measured delay</dt><dd>{duration(publication?.measuredDelayMinutes ?? null)}</dd></div><div><dt>Linked opportunity</dt><dd>{opportunity?.title ?? "Not linked"}</dd></div><div><dt>Linked improvement</dt><dd>{improvement ? <Link href={`/improvements?id=${encodeURIComponent(improvement.id)}`}>{improvement.title} <span aria-hidden="true">↗</span></Link> : "Not linked"}</dd></div></dl></> : <p>Select a constraint to inspect its cause and impact.</p>}</div>
            </div> : <p className="operations-unmapped">No constraints recorded for this process.</p>}
          </section>
        </div>}
      </div>}
  </main>;
}
