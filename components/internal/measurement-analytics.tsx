"use client";

import { useMemo, useState } from "react";
import type { ImpactMetric } from "@/lib/measurement/types";
import { buildMetricSeries, metricWorkflowState } from "@/lib/analytics/series";
import { formatDate, formatUnitValue } from "@/lib/analytics/format";
import { AnalyticsDetailPanel } from "@/components/analytics/analytics-detail-panel";
import { EvidenceState } from "@/components/analytics/evidence-state";
import { ExecutiveKpiSummary } from "@/components/analytics/executive-kpi-summary";
import { MetricComparisonTable } from "@/components/analytics/metric-comparison-table";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";

export function MeasurementAnalytics({ metrics }: { metrics: ImpactMetric[] }) {
  const [selectedId, setSelectedId] = useState(metrics[0]?.id ?? "");
  const selected = metrics.find((metric) => metric.id === selectedId) ?? metrics[0];
  const series = useMemo(() => selected ? buildMetricSeries(selected.observations) : [], [selected]);
  const verifiedCount = metrics.filter((metric) => metric.currentValue !== null).length;
  const reviewCount = metrics.reduce((total, metric) => total + metric.observations.filter((item) => item.verificationStatus === "submitted").length, 0);
  const baselineReviewCount = metrics.filter((metric) => metric.baselineStatus !== "verified").length;
  const supportedCount = metrics.filter((metric) => metric.evidenceConfidence === "supported" || metric.evidenceConfidence === "verified").length;

  return <>
    <section className="analytics-section internal-analytics-section" aria-labelledby="measurement-position-title">
      <div className="analytics-section-heading"><div><h2 id="measurement-position-title">Measurement position</h2><p>Verified results remain separate from submitted observations and unresolved baselines.</p></div><span>{metrics.length} defined {metrics.length === 1 ? "measure" : "measures"}</span></div>
      <ExecutiveKpiSummary items={[
        { id: "defined", label: "Defined measures", value: String(metrics.length), context: "Measures linked to a process or improvement.", status: "pending", stateLabel: "Portfolio" },
        { id: "verified", label: "Measures with a verified actual", value: String(verifiedCount), context: "At least one evidence-backed observation has passed review.", status: verifiedCount ? "verified" : "pending", emphasis: true },
        { id: "review", label: "Observations awaiting review", value: String(reviewCount), context: "Submitted values are visible for review but excluded from reported results.", status: reviewCount ? "submitted" : "verified", stateLabel: reviewCount ? "Review queue" : "Clear" },
        { id: "support", label: "Supported definitions", value: `${supportedCount} / ${metrics.length}`, context: `${baselineReviewCount} measures still lack a verified baseline.`, status: baselineReviewCount ? "pending" : "verified", stateLabel: baselineReviewCount ? "Baseline work" : "Complete" },
      ]}/>
    </section>

    <section className="analytics-section internal-analytics-section" aria-labelledby="measurement-performance-title">
      <div className="analytics-section-heading"><div><h2 id="measurement-performance-title">Operational performance</h2><p>Select a measure to inspect its submitted and verified history against the baseline and target.</p></div><span>Submitted ≠ verified</span></div>
      <MetricComparisonTable metrics={metrics} selectedId={selected?.id ?? ""} onSelect={setSelectedId}/>
      {selected && <div className="metric-detail-grid">
        <AnalyticsDetailPanel title={`${selected.name} history`} meta={<EvidenceState status={metricWorkflowState(selected)}/>}>
          <TimeSeriesChart points={series} references={[
            ...(selected.baselineValue === null ? [] : [{ label: "Baseline", value: selected.baselineValue, tone: "baseline" as const }]),
            ...(selected.targetValue === null ? [] : [{ label: "Target", value: selected.targetValue, tone: "target" as const }]),
          ]} valueFormatter={(value) => formatUnitValue(value, selected.unit)} emptyTitle="No observations recorded" emptyCopy="The historical line begins when an observation is submitted. Only verified points update the reported actual."/>
          {series.some((item) => item.status === "submitted") && <p className="analytics-pending-note">Outlined points are awaiting review. They do not update the latest verified result.</p>}
        </AnalyticsDetailPanel>
        <AnalyticsDetailPanel title="Measurement record" meta={<span>{selected.demo ? "Illustrative example" : "Internal definition"}</span>}>
          <div className="metric-value-sequence"><div><span>Baseline</span><strong>{formatUnitValue(selected.baselineValue, selected.unit)}</strong><small>{selected.baselineStatus === "verified" ? "Verified" : selected.baselineStatus === "rejected" ? "Needs revision" : "Review pending"}</small></div><b aria-hidden="true">→</b><div><span>Target</span><strong>{formatUnitValue(selected.targetValue, selected.unit)}</strong><small>Expected</small></div><b aria-hidden="true">→</b><div><span>Latest verified</span><strong>{formatUnitValue(selected.currentValue, selected.unit)}</strong><small>{selected.currentValue === null ? "Evidence pending" : "Verified actual"}</small></div></div>
          <dl className="analytics-facts"><div><dt>Method</dt><dd>{selected.measurementMethod ?? "Not specified"}</dd></div><div><dt>Cadence</dt><dd>{selected.cadence ?? "Not specified"}</dd></div><div><dt>Owner</dt><dd>{selected.ownerName ?? "Not assigned"}</dd></div><div><dt>Source</dt><dd>{selected.source ?? "Not recorded"}</dd></div><div><dt>Last verified</dt><dd>{formatDate(selected.lastMeasuredAt)}</dd></div><div><dt>Confidence</dt><dd>{selected.evidenceConfidence}</dd></div></dl>
        </AnalyticsDetailPanel>
      </div>}
    </section>
  </>;
}
