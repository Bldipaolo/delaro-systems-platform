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

test("executive totals exclude unapproved models and withhold duplicate streams or mixed currencies", () => {
  const valid = calculateValueModel(base);
  const summary = summarizeEconomicImpact([
    valid,
    calculateValueModel({ ...base, id: "unapproved", benefitStreamKey: "other", aggregationApproved: false }),
  ]);
  assert.equal(summary.eligibleModelCount, 1);
  assert.equal(summary.theoreticalMaximum, 41641.6);
  assert.equal(summary.verifiedRealizedValue, null);
  const duplicate = summarizeEconomicImpact([valid, calculateValueModel({ ...base, id: "duplicate" })]);
  assert.equal(duplicate.hasBenefitStreamConflict, true);
  assert.equal(duplicate.theoreticalMaximum, null);
  const mixed = summarizeEconomicImpact([valid, calculateValueModel({ ...base, id: "foreign", benefitStreamKey: "foreign", currencyCode: "EUR" })]);
  assert.equal(mixed.hasCurrencyConflict, true);
  assert.equal(mixed.currencyCode, null);
  assert.equal(mixed.theoreticalMaximum, null);
});

test("executive stage totals are withheld when any eligible model is incomplete", () => {
  const complete = calculateValueModel({ ...base, recoverablePercentage: 80, expectedCapturePercentage: 75 });
  const incomplete = calculateValueModel({ ...base, id: "incomplete", benefitStreamKey: "incomplete" });
  const summary = summarizeEconomicImpact([complete, incomplete]);
  assert.equal(summary.theoreticalMaximum, 83283.2);
  assert.equal(summary.realisticallyRecoverable, null);
  assert.equal(summary.expectedAnnualValue, null);
  assert.equal(summary.contributingCounts.recoverable, 1);
});

test("attribution, recurring costs, ROI, and payback stay modeled rather than verified", () => {
  const model = calculateValueModel({ ...base, attributionPercentage: 50, attributionRationale: "Conservative attribution review",
    recoverablePercentage: 80, expectedCapturePercentage: 75,
    costs: [
      { id: "c1", category: "implementation", label: "Implementation", amount: 5000, currencyCode: "USD", cadence: "one_time", annualizationFactor: null, sourceDescription: "Approved estimate", evidenceId: null, verificationStatus: "submitted" },
      { id: "c2", category: "software", label: "Software", amount: 100, currencyCode: "USD", cadence: "monthly", annualizationFactor: null, sourceDescription: "Vendor quote", evidenceId: null, verificationStatus: "submitted" },
    ],
  });
  assert.equal(model.attributedMaximum, 20820.8);
  assert.equal(model.expectedAnnualValue, 12492.48);
  assert.equal(model.annualizedCost, 1200);
  assert.equal(model.firstYearCost, 6200);
  assert.equal(model.modeledNetFirstYearValue, 6292.48);
  assert.equal(model.modeledRoiPercentage, 101.5);
  assert.equal(model.modeledPaybackMonths, 5.3);
  assert.equal(model.verifiedRealizedValue, null);
});

test("labor capacity converts minutes to hours through a named safe formula", () => {
  const model = calculateValueModel({ ...base, formulaKind: "minutes_to_hours_product", inputs: [
    { ...base.inputs[0], id: "minutes", key: "minutes_saved", label: "Minutes saved", value: 4, unit: "minutes/email" },
    { ...base.inputs[1], id: "volume", key: "volume", label: "Monthly volume", value: 100, unit: "emails/month" },
    { ...base.inputs[2], id: "rate", key: "rate", label: "Loaded labor rate", value: 30, unit: "USD/hour" },
  ] });
  assert.equal(model.theoreticalMaximum, 200);
});

test("observed, realized, and verified economic states remain distinct", () => {
  const evidence = [{ id: "e1", sourceType: "system_export", sourceReference: "Finance", description: null, documentUrl: null, verificationStatus: "verified" }];
  const observed = { id: "o1", periodStart: "2026-01-01", periodEnd: "2026-01-31", measuredAt: "2026-02-01T00:00:00Z", realizedUnits: 2, unitValue: 50, unitLabel: "hours", realizedValue: 100, annualizationFactor: null, annualizedRunRate: null, annualizationMethod: null, evidenceId: "e1", realizationState: "observed", verificationStatus: "submitted" };
  const realized = { ...observed, id: "r1", periodStart: "2026-02-01", periodEnd: "2026-02-28", realizationState: "realized", verificationStatus: "submitted", realizedUnits: 3, realizedValue: 150 };
  const verified = { ...observed, id: "v1", periodStart: "2026-03-01", periodEnd: "2026-03-31", realizationState: "realized", verificationStatus: "verified", realizedUnits: 4, realizedValue: 200 };
  const model = calculateValueModel({ ...base, evidence, snapshots: [observed, realized, verified] });
  assert.equal(model.observedEconomicValue, 100);
  assert.equal(model.realizedValue, 350);
  assert.equal(model.verifiedRealizedValue, 200);
});

test("stale metric-derived inputs remain visible but flag model data quality", () => {
  const model = calculateValueModel({ ...base, inputs: base.inputs.map((input, index) => index === 0 ? { ...input, derivation: "metric_latest_verified", metricId: "m1", measuredAt: "2026-01-01T00:00:00Z", stale: true } : input) });
  assert.equal(model.valid, true);
  assert.equal(model.dataQuality, "stale");
  assert.equal(model.staleInputCount, 1);
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
