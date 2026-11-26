import { createHash } from "node:crypto";
import type { MeasurementSourceMapping, NormalizedSourceObservation, PeriodGranularity } from "./types";

type ProviderRecord = Record<string, unknown>;

const safePath = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;

export function readProviderField(record: ProviderRecord, path: string): unknown {
  const segments = path.split(".");
  if (!safePath.test(path) || segments.some((segment) => segment === "__proto__" || segment === "prototype" || segment === "constructor")) {
    throw new Error("Unsafe provider field path.");
  }
  return segments.reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return Object.prototype.hasOwnProperty.call(value, key) ? (value as ProviderRecord)[key] : undefined;
  }, record);
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Mapped value must be numeric.");
  return parsed;
}

function timestamp(value: unknown, fallback: Date): Date {
  const parsed = value instanceof Date
    ? new Date(value.getTime())
    : new Date(typeof value === "string" || typeof value === "number" ? value : fallback.getTime());
  if (Number.isNaN(parsed.getTime())) throw new Error("Mapped timestamp is invalid.");
  return parsed;
}

function startOfPeriod(date: Date, granularity: PeriodGranularity): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  if (granularity === "week") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (granularity === "month" || granularity === "quarter") start.setUTCDate(1);
  if (granularity === "quarter") start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3);
  return start;
}

function endOfPeriod(start: Date, granularity: PeriodGranularity): Date {
  const end = new Date(start);
  if (granularity === "day") end.setUTCDate(end.getUTCDate() + 1);
  else if (granularity === "week") end.setUTCDate(end.getUTCDate() + 7);
  else if (granularity === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else if (granularity === "quarter") end.setUTCMonth(end.getUTCMonth() + 3);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

export function applyMappingTransform(rawValue: number, mapping: MeasurementSourceMapping): number {
  switch (mapping.transformKind) {
    case "scale": return rawValue * mapping.scaleFactor + mapping.offsetValue;
    case "duration_ms_to_seconds": return rawValue / 1_000;
    case "minor_currency_to_major": return rawValue / 100;
    case "fraction_to_percentage": return rawValue * 100;
    default: return rawValue;
  }
}

function aggregate(values: number[], method: MeasurementSourceMapping["aggregationMethod"]): number {
  if (method === "count") return values.length;
  if (method === "sum") return values.reduce((total, value) => total + value, 0);
  if (method === "average") return values.reduce((total, value) => total + value, 0) / values.length;
  if (method === "median") {
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }
  if (method === "minimum") return Math.min(...values);
  if (method === "maximum") return Math.max(...values);
  return values.at(-1) ?? Number.NaN;
}

/**
 * Converts provider records into Delaro's bounded ingestion contract. This
 * function never returns or persists the original provider payload.
 */
export function normalizeProviderRecords(
  records: ProviderRecord[],
  mapping: MeasurementSourceMapping,
  receivedAt = new Date(),
): NormalizedSourceObservation[] {
  const candidates = records.map((record, index) => {
    const measuredAt = timestamp(mapping.timestampField ? readProviderField(record, mapping.timestampField) : receivedAt, receivedAt);
    const external = mapping.externalIdField ? readProviderField(record, mapping.externalIdField) : null;
    const sourceRecordId = String(external ?? `${measuredAt.toISOString()}-${index}`).slice(0, 140);
    if (!sourceRecordId) throw new Error("Mapped source record ID is empty.");
    return {
      sourceRecordId,
      rawValue: mapping.aggregationMethod === "count" ? 1 : numeric(readProviderField(record, mapping.valueField)),
      measuredAt,
    };
  }).sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());

  if (mapping.periodGranularity === "event") {
    return candidates.map((item) => ({
      sourceRecordId: item.sourceRecordId,
      rawValue: item.rawValue,
      measuredAt: item.measuredAt.toISOString(),
      periodStart: null,
      periodEnd: null,
      sampleSize: 1,
      sourceReference: item.sourceRecordId,
      sourceUpdatedAt: item.measuredAt.toISOString(),
    }));
  }

  const grouped = new Map<string, typeof candidates>();
  for (const item of candidates) {
    const periodStart = startOfPeriod(item.measuredAt, mapping.periodGranularity).toISOString().slice(0, 10);
    grouped.set(periodStart, [...(grouped.get(periodStart) ?? []), item]);
  }
  return [...grouped.entries()].map(([periodStart, items]) => {
    const latest = items.at(-1)!;
    const periodEnd = endOfPeriod(new Date(`${periodStart}T00:00:00Z`), mapping.periodGranularity).toISOString().slice(0, 10);
    return {
      sourceRecordId: `${mapping.id}:${periodStart}`.slice(0, 140),
      rawValue: aggregate(items.map((item) => item.rawValue), mapping.aggregationMethod),
      measuredAt: latest.measuredAt.toISOString(),
      periodStart,
      periodEnd,
      sampleSize: items.length,
      sourceReference: `${mapping.periodGranularity} ending ${periodEnd}`,
      sourceUpdatedAt: latest.measuredAt.toISOString(),
    };
  });
}

export function sourcePayloadDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
