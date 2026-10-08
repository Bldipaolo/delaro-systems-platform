import type { ImpactMetric } from "./types";

export function formatMeasure(value: number | null, unit: string): string {
  if (value === null) return "Pending";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  return unit === "%" ? `${formatted}%` : unit.startsWith("$") ? `$${formatted}` : `${formatted} ${unit}`;
}

export function resultLabel(metric: ImpactMetric): string {
  return metric.currentValue === null ? "Evidence pending" : "Verified result";
}

export function formatDate(value: string | null): string {
  if (!value) return "Not measured";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
