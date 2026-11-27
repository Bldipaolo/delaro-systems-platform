import type { SignalSeverity, SignalStatus } from "@/lib/operational-intelligence/types";

export type SignalVisibility = "internal_only" | "reviewed" | "client_visible";

export type OperationalSignalEvent = {
  id: string;
  type: string;
  summary: string;
  occurredAt: string;
};

export type OperationalSignalView = {
  id: string;
  organizationId: string;
  organizationName: string;
  ruleId: string | null;
  title: string;
  summary: string;
  signalType: string;
  entityType: "metric" | "workflow" | "measurement_source";
  severity: SignalSeverity;
  confidence: "low" | "medium" | "high";
  status: SignalStatus;
  visibility: SignalVisibility;
  currentValue: number | null;
  referenceValue: number | null;
  percentageDeviation: number | null;
  unit: string | null;
  currentSampleSize: number;
  referenceSampleSize: number;
  consecutivePeriods: number;
  currentWindowStart: string | null;
  currentWindowEnd: string;
  referenceWindowStart: string | null;
  referenceWindowEnd: string | null;
  firstDetectedAt: string;
  lastObservedAt: string;
  detectionMethod: string;
  processId: string | null;
  processName: string | null;
  operationalAreaId: string | null;
  operationalAreaName: string | null;
  workflowId: string | null;
  workflowName: string | null;
  metricId: string | null;
  metricName: string | null;
  sourceId: string | null;
  sourceName: string | null;
  evidence: Record<string, unknown>;
  economicContext: {
    statement?: string;
    models?: Array<{ id: string; name: string; currencyCode: string; verifiedAnnualizedValue: number | null }>;
  };
  events: OperationalSignalEvent[];
  internalNotes?: string | null;
  rule?: {
    currentWindowMinutes: number | null;
    referenceWindowMinutes: number | null;
    minimumCurrentSamples: number;
    minimumReferenceSamples: number;
    minimumConsecutivePeriods: number;
    deviationThresholdPct: number | null;
    publicationMode: "internal_only" | "review_required" | "auto_publish";
  } | null;
  demo?: boolean;
};

export type SignalFilters = {
  organizationId?: string;
  severity?: string;
  type?: string;
  status?: string;
  areaId?: string;
  workflowId?: string;
  metricId?: string;
  period?: "7" | "30" | "90";
};

export type InternalSignalWorkspace = {
  signals: OperationalSignalView[];
  organizations: Array<{ id: string; name: string }>;
  selectedOrganizationId: string;
};
