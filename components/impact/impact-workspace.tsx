"use client";

import { useMemo, useState } from "react";
import type { ImpactMetric } from "@/lib/measurement/types";
import type { CalculatedValueModel, EconomicSummary } from "@/lib/economic-impact/types";
import { buildMetricSeries, buildVerifiedValueSeries, metricWorkflowState } from "@/lib/analytics/series";
import { formatCurrency, formatDate, formatUnitValue } from "@/lib/analytics/format";
import { ExecutiveKpiSummary } from "@/components/analytics/executive-kpi-summary";
import { FinancialBreakdownChart } from "@/components/analytics/financial-breakdown-chart";
import { MetricComparisonTable } from "@/components/analytics/metric-comparison-table";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";
import { EvidenceState } from "@/components/analytics/evidence-state";
import { AnalyticsDetailPanel } from "@/components/analytics/analytics-detail-panel";
import { EconomicImpactSection } from "./economic-impact-section";

export function ImpactWorkspace({ metrics, initialId, valueModels, economicSummary }: { metrics: ImpactMetric[]; initialId?: string; valueModels: CalculatedValueModel[]; economicSummary: EconomicSummary }) {
  const [selectedId, setSelectedId] = useState(initialId ?? metrics[0]?.id ?? "");
  const selected = metrics.find((metric) => metric.id === selectedId) ?? metrics[0];
  const realizedSeries = useMemo(() => buildVerifiedValueSeries(valueModels), [valueModels]);
  const selectedSeries = useMemo(() => selected ? buildMetricSeries(selected.observations) : [], [selected]);
  const isIllustrative = metrics.some((metric) => metric.demo) || valueModels.some((model) => model.demo);
  const verifiedStatus = economicSummary.verifiedRealizedValue === null ? "pending" as const : "verified" as const;
  const aggregationNotice = economicSummary.hasCurrencyConflict
    ? "Totals withheld · mixed currencies"
    : economicSummary.hasBenefitStreamConflict
      ? "Totals withheld · overlapping benefit streams"
      : `${economicSummary.eligibleModelCount} approved ${economicSummary.eligibleModelCount === 1 ? "model" : "models"}`;
  const kpis = [
    { id: "verified", label: "Verified realized value", value: formatCurrency(economicSummary.verifiedRealizedValue, economicSummary.currencyCode), context: "Cumulative observed value. Annualized projections are excluded.", status: verifiedStatus, emphasis: true },
    { id: "expected", label: "Expected annual value", value: formatCurrency(economicSummary.expectedAnnualValue, economicSummary.currencyCode), context: `Modeled annual value after recoverability and expected capture · ${economicSummary.contributingCounts.expected} of ${economicSummary.eligibleModelCount} models complete.`, status: "pending" as const, stateLabel: "Expected" },
    { id: "recoverable", label: "Recoverable annual estimate", value: formatCurrency(economicSummary.realisticallyRecoverable, economicSummary.currencyCode), context: `Documented addressable portion · ${economicSummary.contributingCounts.recoverable} of ${economicSummary.eligibleModelCount} models complete.`, status: "pending" as const, stateLabel: "Estimated" },
    { id: "theoretical", label: "Theoretical annual ceiling", value: formatCurrency(economicSummary.theoreticalMaximum, economicSummary.currencyCode), context: `Maximum before recovery assumptions · ${economicSummary.contributingCounts.theoretical} of ${economicSummary.eligibleModelCount} models complete.`, status: "pending" as const, stateLabel: "Estimated" },
  ];

  return <main className="content analytics-content">
    <header className="analytics-page-header"><div><h1>Impact</h1><p>Verified outcomes first, with the measurement records and financial assumptions available for inspection.</p></div><span>{isIllustrative ? "Illustrative data · not client results" : "Published organization data"}</span></header>

    <section className="analytics-section" aria-labelledby="financial-overview-title">
      <div className="analytics-section-heading"><div><h2 id="financial-overview-title">Financial position</h2><p>Approved value models only. Different currencies and overlapping benefit streams are kept out of the total.</p></div><span>{aggregationNotice}</span></div>
      <ExecutiveKpiSummary items={kpis}/>
      <p className="analytics-method-note"><strong>Time basis:</strong> estimated figures are annual models; verified realized value is cumulative through completed evidence-backed periods. They are not added together.</p>
    </section>

    <section className="analytics-section" aria-labelledby="realized-title">
      <div className="analytics-section-heading"><div><h2 id="realized-title">Verified realized value over time</h2><p>Cumulative value from completed, non-overlapping periods with verified source evidence.</p></div><span>{realizedSeries.length ? `Through ${formatDate(realizedSeries.at(-1)?.date ?? null)}` : "No verified periods"}</span></div>
      <div className="analytics-chart-frame">
        <TimeSeriesChart points={realizedSeries} valueFormatter={(value) => formatCurrency(value, economicSummary.currencyCode, { compact: true })} emptyTitle="No verified realized value yet" emptyCopy="Modeled annual value remains visible above, but it will not appear on this chart until an observed period and its evidence are verified."/>
        <aside className="analytics-chart-note"><strong>Included in the line</strong><dl><div><dt>Evidence-backed models</dt><dd>{economicSummary.contributingCounts.verified}</dd></div><div><dt>Verified periods</dt><dd>{realizedSeries.length}</dd></div><div><dt>Current cumulative value</dt><dd>{formatCurrency(economicSummary.verifiedRealizedValue, economicSummary.currencyCode)}</dd></div></dl><p>Annualized run rates are retained in the audit record but never counted as realized value.</p></aside>
      </div>
    </section>

    <section className="analytics-section" aria-labelledby="breakdown-title">
      <div className="analytics-section-heading"><div><h2 id="breakdown-title">Economic value by improvement</h2><p>Expected annual value is shown inside its recoverable estimate and theoretical ceiling.</p></div><span>Annual model</span></div>
      <FinancialBreakdownChart models={valueModels}/>
    </section>

    <section className="analytics-section" aria-labelledby="performance-title">
      <div className="analytics-section-heading"><div><h2 id="performance-title">Operational performance</h2><p>Baselines and targets remain distinct from actual observations. Only verified observations populate the latest-result column.</p></div><span>{metrics.length} tracked {metrics.length === 1 ? "measure" : "measures"}</span></div>
      <MetricComparisonTable metrics={metrics} selectedId={selected?.id ?? ""} onSelect={setSelectedId}/>
      {selected && <div className="metric-detail-grid">
        <AnalyticsDetailPanel title={`${selected.name} history`} meta={<EvidenceState status={metricWorkflowState(selected)}/>}>
          <TimeSeriesChart points={selectedSeries} references={[
            ...(selected.baselineValue === null ? [] : [{ label: "Baseline", value: selected.baselineValue, tone: "baseline" as const }]),
            ...(selected.targetValue === null ? [] : [{ label: "Target", value: selected.targetValue, tone: "target" as const }]),
          ]} valueFormatter={(value) => formatUnitValue(value, selected.unit)} emptyTitle="No measurement history yet" emptyCopy="The baseline and target are recorded, but no observation has been submitted or verified."/>
          {selectedSeries.some((item) => item.status === "submitted") && <p className="analytics-pending-note">Submitted points are shown for review context only. They do not update the latest verified result.</p>}
        </AnalyticsDetailPanel>
        <AnalyticsDetailPanel title="Measurement record" meta={<span>{selected.demo ? "Illustrative example" : "Published measure"}</span>}>
          <div className="metric-value-sequence"><div><span>Baseline</span><strong>{formatUnitValue(selected.baselineValue, selected.unit)}</strong><small>{selected.baselineStatus === "verified" ? "Verified" : "Evidence pending"}</small></div><b aria-hidden="true">→</b><div><span>Target</span><strong>{formatUnitValue(selected.targetValue, selected.unit)}</strong><small>Expected</small></div><b aria-hidden="true">→</b><div><span>Latest verified</span><strong>{formatUnitValue(selected.currentValue, selected.unit)}</strong><small>{selected.currentValue === null ? "Evidence pending" : "Verified result"}</small></div></div>
          <dl className="analytics-facts"><div><dt>Measurement period</dt><dd>{selected.measurementPeriod ?? selected.baselinePeriod ?? "Not measured"}</dd></div><div><dt>Source</dt><dd>{selected.source ?? "Not provided"}</dd></div><div><dt>Method</dt><dd>{selected.measurementMethod ?? "Not specified"}</dd></div><div><dt>Cadence</dt><dd>{selected.cadence ?? "Not specified"}</dd></div><div><dt>Owner</dt><dd>{selected.ownerName ?? "Not assigned"}</dd></div><div><dt>Last verified</dt><dd>{formatDate(selected.lastMeasuredAt)}</dd></div><div><dt>Evidence</dt><dd>{selected.evidenceDescription ?? "No verified evidence attached"}{selected.evidenceUrl && <a href={selected.evidenceUrl} target="_blank" rel="noopener noreferrer">Open evidence ↗</a>}</dd></div></dl>
          {selected.demo && <p className="analytics-pending-note">Illustrative demo values. Submitted observations remain unverified and are not reported as results.</p>}
        </AnalyticsDetailPanel>
      </div>}
    </section>

    <EconomicImpactSection models={valueModels} summary={economicSummary}/>
  </main>;
}
