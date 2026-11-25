import type { CalculatedValueModel } from "../economic-impact/types";
import { selectEconomicModelsForAggregation } from "../economic-impact/calculate.ts";
import type { ImpactMetric, MetricObservation } from "../measurement/types";

export type AnalyticsSeriesPoint = {
  id: string;
  date: string;
  label: string;
  value: number;
  status: "submitted" | "observed" | "verified";
};

export type RealizedValuePoint = AnalyticsSeriesPoint & {
  periodValue: number;
};

function monthKey(value: string): string {
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : value;
}

export function buildMetricSeries(observations: MetricObservation[]): AnalyticsSeriesPoint[] {
  return observations
    .filter((item) => item.verificationStatus === "verified" || item.verificationStatus === "submitted")
    .map((item) => ({
      id: item.id,
      date: item.periodEnd ?? item.measuredAt,
      label: item.periodLabel ?? item.measuredAt,
      value: item.value,
      status: (item.measurementStatus === "observed" ? "observed" : item.verificationStatus) as AnalyticsSeriesPoint["status"],
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function metricWorkflowState(metric: ImpactMetric): "pending" | "submitted" | "observed" | "verified" {
  const newestSubmitted = metric.observations
    .filter((item) => item.verificationStatus === "submitted")
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  if (newestSubmitted && (!metric.lastMeasuredAt || newestSubmitted.measuredAt > metric.lastMeasuredAt)) return newestSubmitted.measurementStatus === "observed" ? "observed" : "submitted";
  return metric.currentValue !== null ? "verified" : "pending";
}

/** Only approved, same-currency, non-overlapping models can contribute to this series. */
export function buildVerifiedValueSeries(models: CalculatedValueModel[]): RealizedValuePoint[] {
  const eligible = selectEconomicModelsForAggregation(models);
  // The executive line follows the same completeness rule as the headline total.
  // Never plot a partial portfolio while the corresponding total is withheld.
  if (!eligible.length || eligible.some((model) => model.verifiedRealizedValue === null)) return [];
  const grouped = new Map<string, { date: string; value: number; ids: string[] }>();

  for (const model of eligible) {
    const verifiedEvidence = new Set(model.evidence.filter((item) => item.verificationStatus === "verified").map((item) => item.id));
    for (const snapshot of model.snapshots) {
      if (!verifiedEvidence.has(snapshot.evidenceId)) continue;
      const key = monthKey(snapshot.periodEnd);
      const entry = grouped.get(key) ?? { date: snapshot.periodEnd, value: 0, ids: [] };
      entry.value += snapshot.realizedValue;
      entry.ids.push(snapshot.id);
      if (snapshot.periodEnd > entry.date) entry.date = snapshot.periodEnd;
      grouped.set(key, entry);
    }
  }

  let cumulative = 0;
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => {
      cumulative += entry.value;
      return {
        id: entry.ids.join(":"),
        date: entry.date,
        label: key,
        value: Math.round(cumulative * 100) / 100,
        periodValue: Math.round(entry.value * 100) / 100,
        status: "verified" as const,
      };
    });
}
