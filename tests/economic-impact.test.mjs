import test from "node:test";
import assert from "node:assert/strict";
import { calculateValueModel, summarizeEconomicImpact } from "../lib/economic-impact/calculate.ts";

const base = {
  id: "model-1", initiativeId: "initiative-1", opportunityId: null, metricId: null,
  name: "Order handling", category: "labor_savings", formulaKind: "product",
  calculationMethod: "Hours × orders × cost", annualizationBasis: "Annual order count",
  currencyCode: "USD", benefitStreamKey: "order-handling", recoverablePercentage: null,
  expectedCapturePercentage: null, confidence: "pending", confidenceRationale: null, aggregationApproved: true,
  inputs: [
    { id: "a", key: "hours", label: "Hours", role: "factor", value: 1.82, unit: "hours/order", origin: "known", sourceDescription: "Timing sample", evidenceId: null },
    { id: "b", key: "orders", label: "Orders", role: "factor", value: 440, unit: "orders/year", origin: "known", sourceDescription: "ERP", evidenceId: null },
    { id: "c", key: "cost", label: "Loaded cost", role: "factor", value: 52, unit: "USD/hour", origin: "known", sourceDescription: "Finance", evidenceId: null },
  ], evidence: [], snapshots: [], demo: false,
};

test("theoretical value uses exact named factors; missing percentages and evidence remain pending", () => {
  const model = calculateValueModel(base);
  assert.equal(model.theoreticalMaximum, 41641.6);
  assert.equal(model.realisticallyRecoverable, null);
  assert.equal(model.expectedAnnualValue, null);
  assert.equal(model.verifiedRealizedValue, null);
});

test("recoverable and expected values are explicit reductions, never verified results", () => {
  const model = calculateValueModel({ ...base, recoverablePercentage: 75, expectedCapturePercentage: 80 });
  assert.equal(model.realisticallyRecoverable, 31231.2);
  assert.equal(model.expectedAnnualValue, 24984.96);
  assert.equal(model.verifiedRealizedValue, null);
});

test("unverified evidence and overlapping periods cannot become realized totals", () => {
  const snapshot = {
    id: "s1", periodStart: "2026-01-01", periodEnd: "2026-01-31", measuredAt: "2026-02-01T00:00:00Z",
    realizedUnits: 10, unitValue: 52, unitLabel: "hours", realizedValue: 520,
    annualizationFactor: 12, annualizedRunRate: 6240, annualizationMethod: "12 months", evidenceId: "e1",
  };
  const pending = calculateValueModel({ ...base, evidence: [{ id: "e1", sourceType: "sample", sourceReference: "Sample", description: null, documentUrl: null, verificationStatus: "pending" }], snapshots: [snapshot] });
  assert.equal(pending.verifiedRealizedValue, null);
  const verified = calculateValueModel({ ...base, evidence: [{ id: "e1", sourceType: "sample", sourceReference: "Sample", description: null, documentUrl: null, verificationStatus: "verified" }], snapshots: [snapshot] });
  assert.equal(verified.verifiedRealizedValue, 520);
  assert.equal(verified.latestAnnualizedRunRate, 6240);
  const overlap = calculateValueModel({ ...base, evidence: verified.evidence, snapshots: [snapshot, { ...snapshot, id: "s2" }] });
  assert.equal(overlap.verifiedRealizedValue, null);
});

test("executive totals exclude incomplete, unapproved, duplicate, and foreign-currency models", () => {
  const valid = calculateValueModel(base);
  const summary = summarizeEconomicImpact([
    valid,
    calculateValueModel({ ...base, id: "duplicate" }),
    calculateValueModel({ ...base, id: "unapproved", benefitStreamKey: "other", aggregationApproved: false }),
    calculateValueModel({ ...base, id: "foreign", benefitStreamKey: "foreign", currencyCode: "EUR" }),
  ]);
  assert.equal(summary.eligibleModelCount, 1);
  assert.equal(summary.theoreticalMaximum, 41641.6);
  assert.equal(summary.verifiedRealizedValue, null);
});

test("illustrative dashboard totals keep estimates separate from verified value", () => {
  const labor = calculateValueModel({ ...base, recoverablePercentage: 80, expectedCapturePercentage: 75 });
  const revenue = calculateValueModel({ ...base, id: "revenue", benefitStreamKey: "revenue", recoverablePercentage: 80, expectedCapturePercentage: 75,
    inputs: [
      { ...base.inputs[0], id: "r1", key: "revenue_per_order", label: "Revenue per order", value: 2875, unit: "USD/order" },
      { ...base.inputs[1], id: "r2", key: "affected_orders", label: "Affected orders", value: 27, unit: "orders/year" },
    ],
  });
  const rework = calculateValueModel({ ...base, id: "rework", benefitStreamKey: "rework", recoverablePercentage: 80, expectedCapturePercentage: 75,
    inputs: [
      { ...base.inputs[0], id: "e1", key: "cost_per_event", label: "Cost per event", value: 420, unit: "USD/event" },
      { ...base.inputs[1], id: "e2", key: "events", label: "Events", value: 70, unit: "events/year" },
    ],
  });
  const summary = summarizeEconomicImpact([labor, revenue, rework]);
  assert.equal(summary.theoreticalMaximum, 148666.6);
  assert.equal(summary.realisticallyRecoverable, 118933.28);
  assert.equal(summary.expectedAnnualValue, 89199.96);
  assert.equal(summary.verifiedRealizedValue, null);
});
