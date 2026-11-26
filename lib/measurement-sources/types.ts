export type MeasurementProvider = "n8n" | "hubspot" | "api" | "database" | "webhook" | "csv" | "manual" | "other";
export type MeasurementSourceStatus = "draft" | "configured" | "healthy" | "stale" | "degraded" | "failed" | "authentication_required" | "disabled";
export type MappingTransform = "identity" | "scale" | "duration_ms_to_seconds" | "minor_currency_to_major" | "fraction_to_percentage";
export type MappingAggregation = "latest" | "count" | "sum" | "average" | "median" | "minimum" | "maximum";
export type PeriodGranularity = "event" | "day" | "week" | "month" | "quarter";

export type MeasurementSourceMapping = {
  id: string;
  valueField: string;
  timestampField: string | null;
  externalIdField: string | null;
  transformKind: MappingTransform;
  scaleFactor: number;
  offsetValue: number;
  aggregationMethod: MappingAggregation;
  periodGranularity: PeriodGranularity;
};

export type NormalizedSourceObservation = {
  sourceRecordId: string;
  rawValue: number;
  measuredAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  sampleSize: number;
  sourceReference: string | null;
  sourceUpdatedAt: string | null;
};
