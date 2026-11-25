import test from "node:test";
import assert from "node:assert/strict";
import { createMetricIntegrationToken, maxMetricObservationBytes, metricObservationSchema, parseMetricIntegrationToken } from "../lib/measurement/ingestion.ts";
import { calculateImprovement } from "../lib/measurement/calculations.ts";

test("metric reporting credentials are scoped opaque tokens", () => {
  const generated = createMetricIntegrationToken();
  const parsed = parseMetricIntegrationToken(`Bearer ${generated.token}`);
  assert.equal(parsed?.credentialId, generated.credentialId);
  assert.equal(parsed?.secretHash, generated.secretHash);
  assert.equal(generated.token.includes(generated.secretHash), false);
  assert.equal(parseMetricIntegrationToken("Bearer delaro_n8n_wrong"), null);
});

test("metric protocol accepts bounded observations and rejects ambiguous records", () => {
  const valid = { eventId: "execution-42-duration", value: 3.8, unit: "minutes", measuredAt: "2026-11-25T12:00:00Z", periodStart: "2026-11-01", periodEnd: "2026-11-25", sampleSize: 1, aggregation: "single execution", sourceReference: "n8n execution 42", source: "n8n_metric_reporter" };
  assert.equal(metricObservationSchema.safeParse(valid).success, true);
  assert.equal(metricObservationSchema.safeParse({ ...valid, value: "3.8" }).success, false);
  assert.equal(metricObservationSchema.safeParse({ ...valid, periodEnd: "2026-10-31" }).success, false);
  assert.equal(metricObservationSchema.safeParse({ ...valid, customerEmail: "not accepted" }).success, false);
  assert.equal(maxMetricObservationBytes, 16 * 1024);
});

test("improvement calculation respects metric direction and zero baselines", () => {
  assert.deepEqual(calculateImprovement(10, 8, "decrease"), { absolute: 2, percentage: 0.2, favorable: true });
  assert.deepEqual(calculateImprovement(10, 12, "increase"), { absolute: 2, percentage: 0.2, favorable: true });
  assert.deepEqual(calculateImprovement(0, 2, "increase"), { absolute: 2, percentage: null, favorable: true });
  assert.equal(calculateImprovement(10, 11, "decrease").favorable, false);
});

test("n8n metric template is importable and contains no credential", async () => {
  const { readFile } = await import("node:fs/promises");
  const template = JSON.parse(await readFile(new URL("../public/integrations/n8n/delaro-metric-reporter.json", import.meta.url), "utf8"));
  assert.equal(template.nodes.some((node) => node.name === "Report Metric to Delaro"), true);
  assert.match(JSON.stringify(template), /n8n_metric_reporter/);
  assert.doesNotMatch(JSON.stringify(template), /delaro_metric_[0-9a-f-]{36}\./i);
});
