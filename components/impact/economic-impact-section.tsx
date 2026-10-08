"use client";

import { useState } from "react";
import type { CalculatedValueModel, EconomicSummary, ValueInput } from "@/lib/economic-impact/types";

type Stage = "theoreticalMaximum" | "realisticallyRecoverable" | "expectedAnnualValue" | "verifiedRealizedValue";

const categories: Record<CalculatedValueModel["category"], string> = {
  labor_savings: "Labor capacity", capacity_creation: "Capacity creation", revenue_recovery: "Revenue recovery",
  conversion_improvement: "Conversion improvement", response_time_improvement: "Response-time improvement",
  error_reduction: "Error reduction", avoided_hiring: "Avoided hiring",
  working_capital_improvement: "Working-capital improvement", risk_reduction: "Risk reduction",
};
const stages: { key: Stage; label: string; state: string; explanation: string }[] = [
  { key: "theoreticalMaximum", label: "Theoretical maximum", state: "Estimated", explanation: "The full annualized value if every modeled unit were captured. This is a ceiling, not a forecast." },
  { key: "realisticallyRecoverable", label: "Realistically recoverable", state: "Estimated", explanation: "Theoretical maximum multiplied by the documented recoverable percentage." },
  { key: "expectedAnnualValue", label: "Expected annual value", state: "Expected", explanation: "Recoverable value multiplied by the expected capture percentage. It is not a realized result." },
  { key: "verifiedRealizedValue", label: "Verified realized value", state: "Verified", explanation: "Only observed, non-overlapping periods with verified evidence are included. Annualized run rates are excluded." },
];

function money(value: number | null, currencyCode: string | null): string {
  if (value === null || !currencyCode) return "Pending";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(value);
}

function inputValue(input: ValueInput): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(input.value)} ${input.unit}`;
}

function formula(model: CalculatedValueModel): string {
  const factors = model.inputs.filter((input) => input.role === "factor");
  if (model.formulaKind === "product") return factors.map(inputValue).join(" × ");
  const baseline = model.inputs.find((input) => input.role === "baseline");
  const target = model.inputs.find((input) => input.role === "target");
  if (!baseline || !target) return "Inputs incomplete";
  const delta = model.formulaKind === "positive_delta_product"
    ? `(${inputValue(target)} − ${inputValue(baseline)})`
    : `(${inputValue(baseline)} − ${inputValue(target)})`;
  return [delta, ...factors.map(inputValue)].join(" × ");
}

function stageValue(model: CalculatedValueModel, stage: Stage): number | null { return model[stage]; }

function stageEquation(model: CalculatedValueModel, stage: Stage): string {
  if (stage === "theoreticalMaximum") return `${formula(model)} = ${money(model.theoreticalMaximum, model.currencyCode)}`;
  if (stage === "realisticallyRecoverable") return model.recoverablePercentage === null
    ? "Recoverable percentage has not been set."
    : `${money(model.theoreticalMaximum, model.currencyCode)} × ${model.recoverablePercentage}% = ${money(model.realisticallyRecoverable, model.currencyCode)}`;
  if (stage === "expectedAnnualValue") return model.expectedCapturePercentage === null || model.realisticallyRecoverable === null
    ? "Recoverable value and expected capture percentage are required."
    : `${money(model.realisticallyRecoverable, model.currencyCode)} × ${model.expectedCapturePercentage}% = ${money(model.expectedAnnualValue, model.currencyCode)}`;
  return model.verifiedRealizedValue === null
    ? "No verified, non-overlapping observation periods are available."
    : `Sum of verified period values = ${money(model.verifiedRealizedValue, model.currencyCode)}`;
}

export function EconomicImpactSection({ models, summary }: { models: CalculatedValueModel[]; summary: EconomicSummary }) {
  const [stage, setStage] = useState<Stage>("verifiedRealizedValue");
  const [selectedId, setSelectedId] = useState<string | null>(models[0]?.id ?? null);
  const selected = models.find((model) => model.id === selectedId) ?? models[0];
  const activeStage = stages.find((item) => item.key === stage)!;
  const stageCount = stage === "theoreticalMaximum" ? summary.contributingCounts.theoretical
    : stage === "realisticallyRecoverable" ? summary.contributingCounts.recoverable
    : stage === "expectedAnnualValue" ? summary.contributingCounts.expected : summary.contributingCounts.verified;

  return <section className="economic-section" aria-labelledby="economic-title">
    <div className="economic-heading"><div><h2 id="economic-title">Economic impact</h2><p>A conservative ledger of possible value and value actually observed. Select any amount to inspect its basis.</p></div><span>{models[0]?.demo ? "Illustrative demo · not client results" : "Published value models"}</span></div>
    <div className="economic-ledger" aria-label="Economic impact summary">{stages.map((item) => <button type="button" key={item.key} className={`economic-ledger-row ${stage === item.key ? "is-selected" : ""}`} aria-pressed={stage === item.key} onClick={() => setStage(item.key)}>
      <span className="economic-ledger-name">{item.label}<small className={`economic-state economic-state-${item.key === "verifiedRealizedValue" && summary.contributingCounts.verified === 0 ? "pending" : item.state.toLowerCase()}`}>{item.key === "verifiedRealizedValue" && summary.contributingCounts.verified === 0 ? "Evidence pending" : item.state}</small></span>
      <strong>{money(summary[item.key], summary.currencyCode)}</strong><span className="economic-ledger-arrow" aria-hidden="true">↗</span>
    </button>)}</div>
    <div className="economic-audit"><div className="economic-audit-heading"><div><span>Calculation and evidence</span><h3>{activeStage.label}</h3><p>{activeStage.explanation}</p></div><small>{stageCount} of {summary.eligibleModelCount} approved models included</small></div>
      {models.length === 0 ? <p className="economic-empty">No value models have been published. Economic amounts remain pending.</p> : <div className="economic-audit-grid">
        <div className="economic-model-index" aria-label="Value model breakdown">{models.map((model) => <button key={model.id} type="button" className={`economic-model-row ${selected?.id === model.id ? "is-selected" : ""}`} aria-pressed={selected?.id === model.id} onClick={() => setSelectedId(model.id)}><span><strong>{model.name}</strong><small>{categories[model.category]} · {model.aggregationApproved && model.valid && model.currencyCode === summary.currencyCode ? "Approved" : "Not in total"}</small></span><span>{money(stageValue(model, stage), model.currencyCode)}</span></button>)}</div>
        {selected && <article className="economic-model-detail" aria-label={`${selected.name} calculation`}><div className="economic-model-title"><div><span>{categories[selected.category]}</span><h4>{selected.name}</h4></div><strong>{selected.demo ? "Demo example" : selected.confidence === "pending" ? "Evidence pending" : `${selected.confidence} confidence`}</strong></div>
          {selected.confidenceRationale && <p className="economic-confidence-rationale">Confidence basis · {selected.confidenceRationale}</p>}
          {(!selected.aggregationApproved || selected.currencyCode !== summary.currencyCode) && <p className="economic-caution">This model is not included in the executive totals{selected.currencyCode !== summary.currencyCode ? " because currencies cannot be combined" : " until Delaro reviews it for completeness and overlap"}.</p>}
          {selected.validationMessage && <p className="economic-caution">{selected.validationMessage}</p>}
          <dl className="economic-stage-detail"><div><dt>Theoretical maximum · Estimated</dt><dd>{money(selected.theoreticalMaximum, selected.currencyCode)}</dd></div><div><dt>Recoverable · Estimated</dt><dd>{money(selected.realisticallyRecoverable, selected.currencyCode)}<small>{selected.recoverablePercentage === null ? "Recoverable percentage pending" : `${selected.recoverablePercentage}% of maximum`}</small></dd></div><div><dt>Expected annual value · Expected</dt><dd>{money(selected.expectedAnnualValue, selected.currencyCode)}<small>{selected.expectedCapturePercentage === null ? "Expected capture pending" : `${selected.expectedCapturePercentage}% of recoverable`}</small></dd></div><div><dt>Realized to date · Verified</dt><dd>{money(selected.verifiedRealizedValue, selected.currencyCode)}<small>{selected.latestVerifiedPeriod ?? "Evidence pending"}</small></dd></div></dl>
          <div className="economic-method"><h5>Calculation</h5><p>{selected.calculationMethod}</p><code>{stageEquation(selected, stage)}</code>{stage !== "theoreticalMaximum" && <small>Base calculation · {formula(selected)} = {money(selected.theoreticalMaximum, selected.currencyCode)}</small>}<small>Annualization basis · {selected.annualizationBasis}</small></div>
          <div className="economic-inputs"><h5>Inputs and assumptions</h5><dl>{selected.inputs.map((input) => <div key={input.id}><dt>{input.label}<small>{input.origin === "known" ? "Known value" : input.origin === "client_assumption" ? "Client-provided assumption" : "Delaro assumption"}</small></dt><dd>{inputValue(input)}<small>{input.sourceDescription}</small></dd></div>)}</dl></div>
          <div className="economic-evidence"><h5>Evidence</h5>{selected.evidence.length ? <ul>{selected.evidence.map((evidence) => <li key={evidence.id}><span>{evidence.sourceReference}<small>{evidence.description ?? evidence.sourceType}</small></span><strong>{evidence.verificationStatus === "verified" ? "Verified" : "Evidence pending"}</strong>{evidence.documentUrl && <a href={evidence.documentUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>}</li>)}</ul> : <p>No source evidence attached. Estimated figures are not verified results.</p>}
            {selected.snapshots.length > 0 && <div className="economic-realizations"><h5>Verified periods</h5>{selected.snapshots.map((snapshot) => <div key={snapshot.id}><span>{snapshot.periodStart} – {snapshot.periodEnd}</span><strong>{money(snapshot.realizedValue, selected.currencyCode)}</strong><small>{inputValue({ id: snapshot.id, key: "units", label: "Realized units", role: "factor", value: snapshot.realizedUnits, unit: snapshot.unitLabel, origin: "known", sourceDescription: "", evidenceId: null })} × {money(snapshot.unitValue, selected.currencyCode)} / unit</small>{snapshot.annualizedRunRate !== null && <small>Annualized run rate: {money(snapshot.annualizedRunRate, selected.currencyCode)} · projection, not realized value</small>}</div>)}</div>}
          </div>
        </article>}
      </div>}
    </div>
  </section>;
}
