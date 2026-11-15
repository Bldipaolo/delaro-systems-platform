import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatCurrency, formatDate, formatPercentage, formatUnitValue } from "../lib/analytics/format.ts";
import { buildMetricSeries, buildVerifiedValueSeries, metricWorkflowState } from "../lib/analytics/series.ts";
import { calculatePaybackMonths } from "../lib/analytics/business-case.ts";
import { calculateValueModel } from "../lib/economic-impact/calculate.ts";

test("analytics formatters preserve currency, percentage, date, and unit meaning", () => {
  assert.equal(formatCurrency(127420, "USD"), "$127,420.00");
  assert.equal(formatCurrency(null, "USD"), "Pending");
  assert.equal(formatPercentage(62.5), "62.5%");
  assert.equal(formatDate("2026-10-09T23:00:00-04:00"), "Oct 10, 2026");
  assert.equal(formatUnitValue(8.4, "days"), "8.4 days");
  assert.equal(formatUnitValue(62, "%"), "62%");
});

test("metric history keeps submitted and verified states distinct", () => {
  const base = { periodStart: "2026-10-01", periodEnd: "2026-10-31", periodLabel: "October 2026", source: "ERP", evidenceDescription: null, evidenceUrl: null, evidenceStatus: "submitted" };
  const series = buildMetricSeries([
    { ...base, id: "pending", value: 10, measuredAt: "2026-11-01T00:00:00Z", verificationStatus: "pending" },
    { ...base, id: "submitted", value: 8, measuredAt: "2026-11-02T00:00:00Z", verificationStatus: "submitted" },
    { ...base, id: "verified", value: 7, measuredAt: "2026-11-03T00:00:00Z", verificationStatus: "verified", evidenceStatus: "verified" },
  ]);
  assert.deepEqual(series.map((point) => [point.id, point.status]), [["submitted", "submitted"], ["verified", "verified"]]);
});

test("a newer submitted observation is not hidden by an older verified result", () => {
  const observations = [
    { id: "submitted", value: 8, measuredAt: "2026-11-02T00:00:00Z", periodStart: null, periodEnd: null, periodLabel: null, source: null, verificationStatus: "submitted", evidenceStatus: "submitted", evidenceDescription: null, evidenceUrl: null },
  ];
  assert.equal(metricWorkflowState({ currentValue: 7, lastMeasuredAt: "2026-11-01T00:00:00Z", observations }), "submitted");
  assert.equal(metricWorkflowState({ currentValue: 7, lastMeasuredAt: "2026-11-03T00:00:00Z", observations }), "verified");
});

const valueModel = {
  id: "model-1", initiativeId: "initiative-1", opportunityId: null, metricId: null,
  name: "Capacity", category: "labor_savings", formulaKind: "product", calculationMethod: "Units × value",
  annualizationBasis: "Annual", currencyCode: "USD", benefitStreamKey: "capacity", recoverablePercentage: 80,
  expectedCapturePercentage: 75, confidence: "moderate", confidenceRationale: null, aggregationApproved: true,
  inputs: [
    { id: "i1", key: "units", label: "Units", role: "factor", value: 100, unit: "hours", origin: "known", sourceDescription: "ERP", evidenceId: null },
    { id: "i2", key: "value", label: "Value", role: "factor", value: 50, unit: "USD/hour", origin: "known", sourceDescription: "Finance", evidenceId: null },
  ],
  evidence: [{ id: "e1", sourceType: "system_export", sourceReference: "ERP", description: null, documentUrl: null, verificationStatus: "verified" }],
  snapshots: [
    { id: "s1", periodStart: "2026-09-01", periodEnd: "2026-09-30", measuredAt: "2026-10-02T00:00:00Z", realizedUnits: 10, unitValue: 50, unitLabel: "hours", realizedValue: 500, annualizationFactor: null, annualizedRunRate: null, annualizationMethod: null, evidenceId: "e1" },
    { id: "s2", periodStart: "2026-10-01", periodEnd: "2026-10-31", measuredAt: "2026-11-02T00:00:00Z", realizedUnits: 12, unitValue: 50, unitLabel: "hours", realizedValue: 600, annualizationFactor: null, annualizedRunRate: null, annualizationMethod: null, evidenceId: "e1" },
  ], demo: false,
};

test("verified value series is cumulative and withholds mixed-currency aggregation", () => {
  const approved = calculateValueModel(valueModel);
  const unapproved = calculateValueModel({ ...valueModel, id: "model-2", benefitStreamKey: "other", aggregationApproved: false });
  const foreign = calculateValueModel({ ...valueModel, id: "model-3", benefitStreamKey: "foreign", currencyCode: "EUR" });
  const points = buildVerifiedValueSeries([approved, unapproved]);
  assert.deepEqual(points.map((point) => [point.periodValue, point.value]), [[500, 500], [600, 1100]]);
  assert.deepEqual(buildVerifiedValueSeries([approved, foreign]), []);
  const incomplete = calculateValueModel({ ...valueModel, id: "model-4", benefitStreamKey: "incomplete", snapshots: [] });
  assert.deepEqual(buildVerifiedValueSeries([approved, incomplete]), []);
});

test("chart data helpers return honest empty states when nothing is verified", () => {
  assert.deepEqual(buildMetricSeries([]), []);
  assert.deepEqual(buildVerifiedValueSeries([calculateValueModel({ ...valueModel, snapshots: [], evidence: [] })]), []);
});

test("payback is calculated only from supported approved inputs", () => {
  assert.deepEqual(calculatePaybackMonths({ implementationCost: 9500, expectedAnnualValue: 45600 }), { months: 2.5, reason: "supported" });
  assert.equal(calculatePaybackMonths({ implementationCost: null, expectedAnnualValue: 45600 }).reason, "missing_cost");
  assert.equal(calculatePaybackMonths({ implementationCost: 9500, expectedAnnualValue: 45600, sharedCost: true }).reason, "shared_cost");
  assert.equal(calculatePaybackMonths({ implementationCost: 9500, expectedAnnualValue: 45600, modelApproved: false }).reason, "unapproved_model");
  assert.equal(calculatePaybackMonths({ implementationCost: 9500, expectedAnnualValue: 45600, currenciesMatch: false }).reason, "currency_mismatch");
});

test("analytics CSS preserves readable mobile table and chart behavior", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.metric-table thead \{ position: absolute;/);
  assert.match(css, /\.analytics-chart-plot \{ overflow-x: auto;/);
  assert.match(css, /\.cost-benefit-row \{ grid-template-columns: 1fr;/);
  assert.match(css, /\.workbench-record > summary \{ align-items: start; flex-direction: column;/);
  const chart = await readFile(new URL("../components/analytics/time-series-chart.tsx", import.meta.url), "utf8");
  assert.match(chart, /tabIndex=\{0\}/);
  assert.match(chart, /View measurement data/);
});
