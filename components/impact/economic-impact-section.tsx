"use client";

import { useState } from "react";
import type { CalculatedValueModel, EconomicSummary, ValueInput } from "@/lib/economic-impact/types";
import { formatCurrency, formatPercentage } from "@/lib/analytics/format";
import { EvidenceState } from "@/components/analytics/evidence-state";
import { AnalyticsDetailPanel } from "@/components/analytics/analytics-detail-panel";

const categories: Record<CalculatedValueModel["category"], string> = {
  labor_savings: "Labor capacity", capacity_creation: "Capacity creation", revenue_recovery: "Revenue recovery",
  conversion_improvement: "Conversion improvement", response_time_improvement: "Response-time improvement",
  error_reduction: "Error reduction", avoided_hiring: "Avoided hiring",
  working_capital_improvement: "Working-capital improvement", risk_reduction: "Risk reduction",
};

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

export function EconomicImpactSection({ models, summary }: { models: CalculatedValueModel[]; summary: EconomicSummary }) {
  const [selectedId, setSelectedId] = useState(models[0]?.id ?? "");
  const selected = models.find((model) => model.id === selectedId) ?? models[0];
  return <section className="analytics-section" aria-labelledby="audit-title">
    <div className="analytics-section-heading"><div><h2 id="audit-title">Calculations, assumptions, and evidence</h2><p>Select a financial model to inspect every factor, source, confidence state, and verified realization period.</p></div><span>{summary.eligibleModelCount} included in totals</span></div>
    {models.length === 0 ? <div className="analytics-chart-empty" role="status"><strong>No value models published</strong><p>Economic amounts remain pending until a reviewed model is available.</p></div> : <div className="financial-audit-layout">
      <nav className="financial-model-index" aria-label="Financial models">{models.map((model) => <button key={model.id} type="button" onClick={() => setSelectedId(model.id)} aria-pressed={selected?.id === model.id} className={selected?.id === model.id ? "is-selected" : ""}><span><strong>{model.initiativeName ?? model.name}</strong><small>{categories[model.category]}{model.initiativeName ? ` · ${model.name}` : ""}</small></span><span>{formatCurrency(model.expectedAnnualValue, model.currencyCode, { compact: true })}<small>Expected annual</small></span></button>)}</nav>
      {selected && <AnalyticsDetailPanel title={selected.name} meta={<span className="financial-model-status">{selected.verifiedRealizedValue !== null ? "Verified realized value" : `Modeled · ${selected.confidence} confidence`}</span>}>
        <p className="financial-model-description">{selected.calculationMethod}</p>
        {selected.validationMessage && <p className="analytics-caution">{selected.validationMessage}</p>}
        {!selected.aggregationApproved && <p className="analytics-caution">This model is not included in executive totals until Delaro completes overlap and completeness review.</p>}
        <dl className="financial-stage-grid"><div><dt>Theoretical ceiling <small>Estimated</small></dt><dd>{formatCurrency(selected.theoreticalMaximum, selected.currencyCode)}</dd></div><div><dt>Recoverable <small>{selected.recoverablePercentage === null ? "Assumption pending" : formatPercentage(selected.recoverablePercentage)}</small></dt><dd>{formatCurrency(selected.realisticallyRecoverable, selected.currencyCode)}</dd></div><div><dt>Expected annual <small>{selected.expectedCapturePercentage === null ? "Assumption pending" : `${formatPercentage(selected.expectedCapturePercentage)} of recoverable`}</small></dt><dd>{formatCurrency(selected.expectedAnnualValue, selected.currencyCode)}</dd></div><div><dt>Realized to date <small>Verified periods only</small></dt><dd>{formatCurrency(selected.verifiedRealizedValue, selected.currencyCode)}</dd></div></dl>
        <div className="financial-method"><h4>Calculation</h4><p>{formula(selected)} = {formatCurrency(selected.theoreticalMaximum, selected.currencyCode)}</p><small>Annualization basis · {selected.annualizationBasis}</small>{selected.confidenceRationale && <small>Confidence basis · {selected.confidenceRationale}</small>}</div>
        <div className="financial-record-grid">
          <section><h4>Inputs and assumptions</h4><dl>{selected.inputs.map((input) => <div key={input.id}><dt>{input.label}<small>{input.origin === "known" ? "Known value" : input.origin === "client_assumption" ? "Client-provided assumption" : "Delaro assumption"}</small></dt><dd>{inputValue(input)}<small>{input.sourceDescription}</small></dd></div>)}</dl></section>
          <section><h4>Evidence</h4>{selected.evidence.length ? <ul>{selected.evidence.map((evidence) => <li key={evidence.id}><span>{evidence.sourceReference}<small>{evidence.description ?? evidence.sourceType}</small></span><EvidenceState status={evidence.verificationStatus}/>{evidence.documentUrl && <a href={evidence.documentUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>}</li>)}</ul> : <p>No source evidence attached. Estimated figures are not verified results.</p>}
          {selected.snapshots.length > 0 && <div className="financial-periods"><h4>Verified periods</h4>{selected.snapshots.map((snapshot) => <div key={snapshot.id}><span>{snapshot.periodStart} – {snapshot.periodEnd}</span><strong>{formatCurrency(snapshot.realizedValue, selected.currencyCode)}</strong><small>{snapshot.realizedUnits} {snapshot.unitLabel} × {formatCurrency(snapshot.unitValue, selected.currencyCode)} per unit</small>{snapshot.annualizedRunRate !== null && <small>Annualized run rate: {formatCurrency(snapshot.annualizedRunRate, selected.currencyCode)} · projection, not realized value</small>}</div>)}</div>}
          </section>
        </div>
      </AnalyticsDetailPanel>}
    </div>}
  </section>;
}
