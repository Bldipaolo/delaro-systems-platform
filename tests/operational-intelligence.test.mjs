import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMetricDeviation, evaluateSourceHealth, evaluateTargetBreach, evaluateWorkflowDuration,
  evaluateWorkflowFailureRate, operationalSignalIdentity, severityFromEvidence, transitionSignal,
} from "../lib/operational-intelligence/detection.ts";
import { interquartileRange, median, medianAbsoluteDeviation, percentile } from "../lib/operational-intelligence/statistics.ts";

const now = new Date("2026-11-26T12:00:00.000Z");
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
const rule = { currentWindowMinutes: 3*24*60, referenceWindowMinutes: 30*24*60,
  minimumCurrentSamples: 3, minimumReferenceSamples: 7, minimumConsecutivePeriods: 2,
  deviationThresholdPct: 30, recoveryThresholdPct: 15, importance: 3 };

test("robust statistics resist one extreme record", () => {
  const values = [10,10,11,11,12,12,500];
  assert.equal(median(values),11);
  assert.equal(percentile(values,.5),11);
  assert.equal(medianAbsoluteDeviation(values),1);
  assert.equal(interquartileRange(values),1.5);
});

test("metric deterioration respects desired direction and rolling median", () => {
  const reference = [10,11,10,12,11,10,12].map((value,index)=>({value,observedAt:minutesAgo((index+5)*24*60),aggregation:"daily median"}));
  const current = [16,17,18].map((value,index)=>({value,observedAt:minutesAgo((2-index)*24*60),aggregation:"daily median"}));
  const result = evaluateMetricDeviation({points:[...reference,...current],rule,direction:"decrease",sourceHealth:"healthy",now});
  assert.equal(result.outcome,"triggered");
  assert.equal(result.currentValue,17);
  assert.equal(result.referenceValue,11);
  assert.ok((result.percentageDeviation ?? 0)>50);
  assert.equal(result.evidence.statistic,"median");
});

test("metric movement in the desired direction is normal", () => {
  const reference = [20,21,22,20,21,22,20].map((value,index)=>({value,observedAt:minutesAgo((index+5)*24*60)}));
  const current = [15,14,13].map((value,index)=>({value,observedAt:minutesAgo((2-index)*24*60)}));
  assert.equal(evaluateMetricDeviation({points:[...reference,...current],rule,direction:"decrease",now}).outcome,"normal");
});

test("insufficient and incompatible data never create a signal", () => {
  const tooSmall = evaluateMetricDeviation({points:[{value:12,observedAt:minutesAgo(30)}],rule,direction:"decrease",now});
  assert.equal(tooSmall.outcome,"insufficient_data");
  const mixed = evaluateMetricDeviation({points:[{value:1,observedAt:minutesAgo(1),aggregation:"sum"},{value:2,observedAt:minutesAgo(2),aggregation:"median"}],rule,direction:"decrease",now});
  assert.equal(mixed.reasonCode,"incompatible_aggregation");
});

test("stale source health suppresses business deterioration", () => {
  const points = Array.from({length:12},(_,index)=>({value:index<7?10:20,observedAt:minutesAgo((12-index)*24*60)}));
  const result = evaluateMetricDeviation({points,rule,direction:"decrease",sourceHealth:"stale",now});
  assert.equal(result.outcome,"suppressed");
  assert.equal(result.reasonCode,"source_stale");
});

test("explicit target breaches remain distinct from rolling anomalies", () => {
  const result = evaluateTargetBreach({points:[{value:21,observedAt:minutesAgo(1)}],target:15,direction:"decrease",sourceHealth:"healthy",now});
  assert.equal(result.outcome,"triggered");
  assert.equal(result.reasonCode,"target_breached");
  assert.equal(result.referenceValue,15);
});

test("workflow failure rate compares compatible terminal windows", () => {
  const reference = Array.from({length:10},(_,index)=>({status:index===0?"failed":"successful",observedAt:minutesAgo((index+5)*24*60)}));
  const current = ["failed","failed","successful","failed","successful"].map((status,index)=>({status,observedAt:minutesAgo((4-index)*60)}));
  const result = evaluateWorkflowFailureRate({executions:[...reference,...current],rule:{...rule,minimumCurrentSamples:5,deviationThresholdPct:20,minimumConsecutivePeriods:1},now});
  assert.equal(result.outcome,"triggered");
  assert.equal(result.currentValue,60);
  assert.equal(result.referenceValue,10);
});

test("workflow duration uses successful median runtime", () => {
  const reference = Array.from({length:8},(_,index)=>({status:"successful",durationMs:3000+(index%2)*100,observedAt:minutesAgo((index+5)*24*60)}));
  const current = Array.from({length:4},(_,index)=>({status:"successful",durationMs:7000+index*100,observedAt:minutesAgo((3-index)*60)}));
  const result = evaluateWorkflowDuration({executions:[...reference,...current],rule:{...rule,minimumCurrentSamples:4},now});
  assert.equal(result.outcome,"triggered");
  assert.ok((result.percentageDeviation ?? 0)>100);
});

test("source health creates infrastructure signals without inferring business loss", () => {
  const result = evaluateSourceHealth({status:"degraded",consecutiveFailures:3,staleMinutes:120});
  assert.equal(result.outcome,"triggered");
  assert.equal(result.severity,"medium");
  assert.equal(result.evidence.sourceHealth,"degraded");
});

test("severity requires magnitude, persistence, and importance for critical", () => {
  assert.equal(severityFromEvidence({deviationPct:35,thresholdPct:30,consecutivePeriods:1,importance:3}),"low");
  assert.equal(severityFromEvidence({deviationPct:150,thresholdPct:30,consecutivePeriods:4,importance:5,customerFacingImpact:true}),"critical");
});

test("signal identity is deterministic and tenant-specific", () => {
  const first=operationalSignalIdentity("org-a","rule","entity","metric_deterioration");
  assert.equal(first,operationalSignalIdentity("org-a","rule","entity","metric_deterioration"));
  assert.notEqual(first,operationalSignalIdentity("org-b","rule","entity","metric_deterioration"));
  assert.match(first,/^[0-9a-f]{64}$/);
});

test("hysteresis monitors one recovery pass before resolving", () => {
  const monitoring=transitionSignal({existingStatus:"active",outcome:"normal",recoveryPasses:0});
  assert.equal(monitoring.status,"monitoring");
  const resolved=transitionSignal({existingStatus:"monitoring",outcome:"normal",recoveryPasses:1});
  assert.equal(resolved.status,"resolved");
  const reopened=transitionSignal({existingStatus:"resolved",outcome:"triggered",recoveryPasses:2});
  assert.equal(reopened.status,"active");
  assert.equal(reopened.event,"reopened");
});
