export type SignalSeverity = "info" | "low" | "medium" | "high" | "critical";
export type SignalStatus = "active" | "monitoring" | "acknowledged" | "resolved" | "dismissed";
export type SignalOutcome = "triggered" | "normal" | "suppressed" | "insufficient_data";
export type ImprovementDirection = "increase" | "decrease" | "target";
export type SourceHealth = "healthy" | "configured" | "stale" | "degraded" | "failed" | "authentication_required" | "disabled" | "draft";

export interface NumericPoint {
  value: number;
  observedAt: string;
  sampleSize?: number | null;
  aggregation?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface WorkflowExecutionPoint {
  status: "running" | "successful" | "failed" | "unknown";
  observedAt: string;
  durationMs?: number | null;
}

export interface WindowRule {
  currentWindowMinutes: number;
  referenceWindowMinutes: number;
  minimumCurrentSamples: number;
  minimumReferenceSamples: number;
  minimumConsecutivePeriods: number;
  deviationThresholdPct: number;
  recoveryThresholdPct: number;
  importance: 1 | 2 | 3 | 4 | 5;
}

export interface DetectionResult {
  outcome: SignalOutcome;
  reasonCode: string;
  currentValue: number | null;
  referenceValue: number | null;
  absoluteDeviation: number | null;
  percentageDeviation: number | null;
  currentSampleSize: number;
  referenceSampleSize: number;
  consecutivePeriods: number;
  currentWindowStart: string | null;
  currentWindowEnd: string;
  referenceWindowStart: string | null;
  referenceWindowEnd: string | null;
  severity: SignalSeverity | null;
  confidence: "low" | "medium" | "high" | null;
  evidence: Record<string, string | number | boolean | null>;
}

export interface SeverityContext {
  deviationPct: number;
  thresholdPct: number;
  consecutivePeriods: number;
  importance: 1 | 2 | 3 | 4 | 5;
  customerFacingImpact?: boolean;
  associatedVerifiedAnnualValue?: number | null;
}

export interface SignalTransition {
  status: SignalStatus;
  recoveryPasses: number;
  event: "none" | "detected" | "updated" | "monitoring" | "resolved" | "reopened";
}
