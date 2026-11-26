import { createHash } from "node:crypto";
import { interquartileRange, median, medianAbsoluteDeviation, percentageChange } from "./statistics.ts";
import type {
  DetectionResult, ImprovementDirection, NumericPoint, SeverityContext, SignalOutcome,
  SignalSeverity, SignalStatus, SignalTransition, SourceHealth, WindowRule, WorkflowExecutionPoint,
} from "./types.ts";

const trustworthySourceStates = new Set<SourceHealth>(["healthy"]);

function iso(value: number) { return new Date(value).toISOString(); }

function emptyResult(outcome: SignalOutcome, reasonCode: string, now: number, evidence: DetectionResult["evidence"] = {}): DetectionResult {
  return {
    outcome, reasonCode, currentValue: null, referenceValue: null, absoluteDeviation: null,
    percentageDeviation: null, currentSampleSize: 0, referenceSampleSize: 0,
    consecutivePeriods: 0, currentWindowStart: null, currentWindowEnd: iso(now),
    referenceWindowStart: null, referenceWindowEnd: null, severity: null, confidence: null, evidence,
  };
}

function splitNumericWindows(points: NumericPoint[], rule: WindowRule, now: number) {
  const currentStart = now - rule.currentWindowMinutes * 60_000;
  const referenceStart = currentStart - rule.referenceWindowMinutes * 60_000;
  const bounded = points
    .map((point) => ({ ...point, time: Date.parse(point.observedAt) }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time) && point.time <= now && point.time >= referenceStart);
  return {
    current: bounded.filter((point) => point.time >= currentStart),
    reference: bounded.filter((point) => point.time < currentStart),
    currentStart, referenceStart,
  };
}

function confidence(currentSamples: number, referenceSamples: number, rule: WindowRule): "low" | "medium" | "high" {
  const multiple = Math.min(currentSamples / rule.minimumCurrentSamples, referenceSamples / rule.minimumReferenceSamples);
  return multiple >= 3 ? "high" : multiple >= 1.5 ? "medium" : "low";
}

function worseningDelta(current: number, reference: number, direction: ImprovementDirection) {
  if (direction === "decrease") return current - reference;
  if (direction === "increase") return reference - current;
  return Math.abs(current - reference);
}

function consecutiveDeterioration(points: NumericPoint[], direction: ImprovementDirection) {
  if (points.length < 2) return 0;
  const sorted = points.toSorted((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  let count = 1;
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    const current = sorted[index].value;
    const previous = sorted[index - 1].value;
    const worsened = direction === "decrease" ? current > previous : direction === "increase" ? current < previous : false;
    if (!worsened) break;
    count += 1;
  }
  return count;
}

export function severityFromEvidence(context: SeverityContext): SignalSeverity {
  const ratio = context.thresholdPct > 0 ? context.deviationPct / context.thresholdPct : 1;
  let score = ratio >= 4 ? 4 : ratio >= 2.5 ? 3 : ratio >= 1.5 ? 2 : 1;
  if (context.consecutivePeriods >= 3) score += 1;
  if (context.importance >= 4) score += 1;
  if (context.customerFacingImpact) score += 1;
  if ((context.associatedVerifiedAnnualValue ?? 0) > 0) score += 1;
  if (score >= 6 && context.consecutivePeriods >= 3) return "critical";
  if (score >= 4) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export function evaluateMetricDeviation(input: {
  points: NumericPoint[];
  rule: WindowRule;
  direction: ImprovementDirection;
  sourceHealth?: SourceHealth | null;
  now?: Date;
}): DetectionResult {
  const now = (input.now ?? new Date()).getTime();
  if (input.sourceHealth && !trustworthySourceStates.has(input.sourceHealth)) {
    return emptyResult("suppressed", `source_${input.sourceHealth}`, now, { sourceHealth: input.sourceHealth });
  }
  const aggregations = new Set(input.points.map((point) => point.aggregation).filter(Boolean));
  if (aggregations.size > 1) return emptyResult("insufficient_data", "incompatible_aggregation", now, { aggregationCount: aggregations.size });
  const { current, reference, currentStart, referenceStart } = splitNumericWindows(input.points, input.rule, now);
  if (current.length < input.rule.minimumCurrentSamples || reference.length < input.rule.minimumReferenceSamples) {
    const result = emptyResult("insufficient_data", "minimum_samples", now, {
      requiredCurrent: input.rule.minimumCurrentSamples, requiredReference: input.rule.minimumReferenceSamples,
    });
    return { ...result, currentSampleSize: current.length, referenceSampleSize: reference.length,
      currentWindowStart: iso(currentStart), referenceWindowStart: iso(referenceStart), referenceWindowEnd: iso(currentStart) };
  }
  const currentValue = median(current.map((point) => point.value));
  const referenceValue = median(reference.map((point) => point.value));
  if (currentValue === null || referenceValue === null) return emptyResult("insufficient_data", "missing_numeric_values", now);
  const rawPct = percentageChange(currentValue, referenceValue);
  const deterioration = worseningDelta(currentValue, referenceValue, input.direction);
  const deteriorationPct = referenceValue === 0 ? null : (deterioration / Math.abs(referenceValue)) * 100;
  const consecutive = consecutiveDeterioration(current, input.direction);
  const thresholdMet = deterioration > 0 && deteriorationPct !== null && deteriorationPct >= input.rule.deviationThresholdPct;
  const persistenceMet = consecutive >= input.rule.minimumConsecutivePeriods;
  const outcome: SignalOutcome = thresholdMet && persistenceMet ? "triggered" : "normal";
  const deviationForSeverity = Math.max(0, deteriorationPct ?? 0);
  return {
    outcome,
    reasonCode: outcome === "triggered" ? "material_deterioration" : "within_expected_range",
    currentValue, referenceValue, absoluteDeviation: currentValue - referenceValue,
    percentageDeviation: rawPct, currentSampleSize: current.length, referenceSampleSize: reference.length,
    consecutivePeriods: consecutive, currentWindowStart: iso(currentStart), currentWindowEnd: iso(now),
    referenceWindowStart: iso(referenceStart), referenceWindowEnd: iso(currentStart),
    severity: outcome === "triggered" ? severityFromEvidence({ deviationPct: deviationForSeverity,
      thresholdPct: input.rule.deviationThresholdPct, consecutivePeriods: consecutive, importance: input.rule.importance }) : null,
    confidence: confidence(current.length, reference.length, input.rule),
    evidence: {
      statistic: "median", referenceMad: medianAbsoluteDeviation(reference.map((point) => point.value)),
      referenceIqr: interquartileRange(reference.map((point) => point.value)), direction: input.direction,
    },
  };
}

export function evaluateTargetBreach(input: {
  points: NumericPoint[];
  target: number;
  direction: ImprovementDirection;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
  sourceHealth?: SourceHealth | null;
  now?: Date;
}): DetectionResult {
  const now = (input.now ?? new Date()).getTime();
  if (input.sourceHealth && !trustworthySourceStates.has(input.sourceHealth)) {
    return emptyResult("suppressed", `source_${input.sourceHealth}`, now, { sourceHealth: input.sourceHealth });
  }
  const latest = input.points.toSorted((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  if (!latest || !Number.isFinite(latest.value)) return emptyResult("insufficient_data", "no_current_observation", now);
  const delta = latest.value - input.target;
  const breached = input.direction === "decrease" ? latest.value > input.target
    : input.direction === "increase" ? latest.value < input.target : latest.value !== input.target;
  let severity: SignalSeverity | null = breached ? "medium" : null;
  if (breached && input.criticalThreshold !== null && input.criticalThreshold !== undefined) {
    const critical = input.direction === "decrease" ? latest.value >= input.criticalThreshold
      : input.direction === "increase" ? latest.value <= input.criticalThreshold : Math.abs(delta) >= Math.abs(input.criticalThreshold - input.target);
    if (critical) severity = "critical";
  } else if (breached && input.warningThreshold !== null && input.warningThreshold !== undefined) {
    severity = "low";
  }
  return {
    outcome: breached ? "triggered" : "normal", reasonCode: breached ? "target_breached" : "target_met",
    currentValue: latest.value, referenceValue: input.target, absoluteDeviation: delta,
    percentageDeviation: percentageChange(latest.value, input.target), currentSampleSize: 1, referenceSampleSize: 1,
    consecutivePeriods: 1, currentWindowStart: latest.observedAt, currentWindowEnd: iso(now),
    referenceWindowStart: null, referenceWindowEnd: null, severity, confidence: "high",
    evidence: { statistic: "explicit_target", direction: input.direction },
  };
}

function splitWorkflowWindows(points: WorkflowExecutionPoint[], rule: WindowRule, now: number) {
  const currentStart = now - rule.currentWindowMinutes * 60_000;
  const referenceStart = currentStart - rule.referenceWindowMinutes * 60_000;
  const bounded = points.map((point) => ({ ...point, time: Date.parse(point.observedAt) }))
    .filter((point) => Number.isFinite(point.time) && point.time <= now && point.time >= referenceStart);
  return { current: bounded.filter((point) => point.time >= currentStart),
    reference: bounded.filter((point) => point.time < currentStart), currentStart, referenceStart };
}

export function evaluateWorkflowFailureRate(input: { executions: WorkflowExecutionPoint[]; rule: WindowRule; now?: Date }): DetectionResult {
  const now = (input.now ?? new Date()).getTime();
  const { current, reference, currentStart, referenceStart } = splitWorkflowWindows(input.executions, input.rule, now);
  const currentTerminal = current.filter((item) => item.status === "successful" || item.status === "failed");
  const referenceTerminal = reference.filter((item) => item.status === "successful" || item.status === "failed");
  if (currentTerminal.length < input.rule.minimumCurrentSamples || referenceTerminal.length < input.rule.minimumReferenceSamples) {
    const result = emptyResult("insufficient_data", "minimum_samples", now);
    return { ...result, currentSampleSize: currentTerminal.length, referenceSampleSize: referenceTerminal.length,
      currentWindowStart: iso(currentStart), referenceWindowStart: iso(referenceStart), referenceWindowEnd: iso(currentStart) };
  }
  const currentRate = currentTerminal.filter((item) => item.status === "failed").length / currentTerminal.length;
  const referenceRate = referenceTerminal.filter((item) => item.status === "failed").length / referenceTerminal.length;
  const pointIncrease = (currentRate - referenceRate) * 100;
  const triggered = pointIncrease >= input.rule.deviationThresholdPct;
  const consecutiveFailures = currentTerminal.toSorted((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .findIndex((item) => item.status !== "failed");
  const consecutive = consecutiveFailures === -1 ? currentTerminal.length : consecutiveFailures;
  return {
    outcome: triggered ? "triggered" : "normal", reasonCode: triggered ? "failure_rate_increase" : "failure_rate_normal",
    currentValue: currentRate * 100, referenceValue: referenceRate * 100, absoluteDeviation: pointIncrease,
    percentageDeviation: percentageChange(currentRate, referenceRate), currentSampleSize: currentTerminal.length,
    referenceSampleSize: referenceTerminal.length, consecutivePeriods: consecutive,
    currentWindowStart: iso(currentStart), currentWindowEnd: iso(now), referenceWindowStart: iso(referenceStart), referenceWindowEnd: iso(currentStart),
    severity: triggered ? severityFromEvidence({ deviationPct: pointIncrease, thresholdPct: input.rule.deviationThresholdPct,
      consecutivePeriods: Math.max(1, consecutive), importance: input.rule.importance }) : null,
    confidence: confidence(currentTerminal.length, referenceTerminal.length, input.rule),
    evidence: { statistic: "failure_rate", currentFailures: currentTerminal.filter((item) => item.status === "failed").length,
      referenceFailures: referenceTerminal.filter((item) => item.status === "failed").length },
  };
}

export function evaluateWorkflowDuration(input: { executions: WorkflowExecutionPoint[]; rule: WindowRule; now?: Date }): DetectionResult {
  const now = (input.now ?? new Date()).getTime();
  const { current, reference, currentStart, referenceStart } = splitWorkflowWindows(input.executions, input.rule, now);
  const currentDurations = current.flatMap((item) => item.status === "successful" && item.durationMs !== null && item.durationMs !== undefined ? [item.durationMs] : []);
  const referenceDurations = reference.flatMap((item) => item.status === "successful" && item.durationMs !== null && item.durationMs !== undefined ? [item.durationMs] : []);
  if (currentDurations.length < input.rule.minimumCurrentSamples || referenceDurations.length < input.rule.minimumReferenceSamples) {
    const result = emptyResult("insufficient_data", "minimum_samples", now);
    return { ...result, currentSampleSize: currentDurations.length, referenceSampleSize: referenceDurations.length,
      currentWindowStart: iso(currentStart), referenceWindowStart: iso(referenceStart), referenceWindowEnd: iso(currentStart) };
  }
  const currentValue = median(currentDurations) ?? 0;
  const referenceValue = median(referenceDurations) ?? 0;
  const pct = percentageChange(currentValue, referenceValue);
  const triggered = pct !== null && pct >= input.rule.deviationThresholdPct;
  return {
    outcome: triggered ? "triggered" : "normal", reasonCode: triggered ? "runtime_increase" : "runtime_normal",
    currentValue, referenceValue, absoluteDeviation: currentValue-referenceValue, percentageDeviation: pct,
    currentSampleSize: currentDurations.length, referenceSampleSize: referenceDurations.length, consecutivePeriods: 1,
    currentWindowStart: iso(currentStart), currentWindowEnd: iso(now), referenceWindowStart: iso(referenceStart), referenceWindowEnd: iso(currentStart),
    severity: triggered ? severityFromEvidence({ deviationPct: pct ?? 0, thresholdPct: input.rule.deviationThresholdPct,
      consecutivePeriods: 1, importance: input.rule.importance }) : null,
    confidence: confidence(currentDurations.length, referenceDurations.length, input.rule),
    evidence: { statistic: "median", referenceMad: medianAbsoluteDeviation(referenceDurations), referenceIqr: interquartileRange(referenceDurations) },
  };
}

export function evaluateSourceHealth(input: { status: SourceHealth; consecutiveFailures: number; staleMinutes: number | null }): DetectionResult {
  const now = Date.now();
  if (input.status === "healthy" || input.status === "configured" || input.status === "draft" || input.status === "disabled") {
    return emptyResult("normal", input.status === "healthy" ? "source_healthy" : `source_${input.status}`, now, { sourceHealth: input.status });
  }
  const severity: SignalSeverity = input.status === "authentication_required" || input.consecutiveFailures >= 5 ? "high"
    : input.status === "failed" || input.consecutiveFailures >= 3 ? "medium" : "low";
  return {
    ...emptyResult("triggered", `source_${input.status}`, now, { sourceHealth: input.status, staleMinutes: input.staleMinutes,
      consecutiveFailures: input.consecutiveFailures }),
    currentValue: input.staleMinutes, currentSampleSize: 1, consecutivePeriods: Math.max(1,input.consecutiveFailures), severity, confidence: "high",
  };
}

export function operationalSignalIdentity(organizationId: string, ruleId: string, entityId: string, signalType: string) {
  return createHash("sha256").update(`${organizationId}:${ruleId}:${entityId}:${signalType}`, "utf8").digest("hex");
}

export function transitionSignal(input: { existingStatus?: SignalStatus | null; outcome: SignalOutcome; recoveryPasses?: number }): SignalTransition {
  const existing = input.existingStatus ?? null;
  const passes = input.recoveryPasses ?? 0;
  if (input.outcome === "triggered") {
    if (existing === "resolved" || existing === "monitoring") return { status: "active", recoveryPasses: 0, event: "reopened" };
    return { status: existing === "acknowledged" ? "acknowledged" : "active", recoveryPasses: 0, event: existing ? "updated" : "detected" };
  }
  if (input.outcome === "normal") {
    if (!existing || existing === "resolved" || existing === "dismissed") return { status: existing ?? "resolved", recoveryPasses: passes, event: "none" };
    if (existing === "monitoring" && passes + 1 >= 2) return { status: "resolved", recoveryPasses: passes + 1, event: "resolved" };
    return { status: "monitoring", recoveryPasses: passes + 1, event: "monitoring" };
  }
  return { status: existing ?? "active", recoveryPasses: passes, event: "none" };
}
