import type { OperationalSignalView } from "@/lib/operational-intelligence/view-types";

export function signalLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function signalValue(value: number | null, unit: string | null) {
  if (value === null) return "Not available";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (!unit) return formatted;
  if (unit === "%") return `${formatted}%`;
  return `${formatted} ${unit}`;
}

export function signalDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function signalPeriod(signal: OperationalSignalView) {
  if (!signal.currentWindowStart) return `Observed ${signalDate(signal.lastObservedAt)}`;
  return `${signalDate(signal.currentWindowStart)} – ${signalDate(signal.currentWindowEnd)}`;
}

export function signalDestination(signal: OperationalSignalView) {
  if (signal.workflowId) return { label: signal.workflowName ?? "Related workflow", href: `/workflows/${signal.workflowId}` };
  if (signal.metricId) return { label: signal.metricName ?? "Related metric", href: "/impact" };
  if (signal.processId) return { label: signal.processName ?? "Related process", href: "/operations" };
  return signal.sourceId ? { label: signal.sourceName ?? "Measurement source", href: "/impact" } : null;
}
