import type { ImpactMetric } from "./types";
import { formatDate as formatAnalyticsDate, formatUnitValue } from "@/lib/analytics/format";

export function formatMeasure(value: number | null, unit: string): string {
  return formatUnitValue(value, unit);
}

export function resultLabel(metric: ImpactMetric): string {
  return metric.currentValue === null ? "Evidence pending" : "Verified result";
}

export function formatDate(value: string | null): string {
  return formatAnalyticsDate(value);
}
