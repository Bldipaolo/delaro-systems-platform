import test from "node:test";
import assert from "node:assert/strict";
import { applyMappingTransform, normalizeProviderRecords, readProviderField, sourcePayloadDigest } from "../lib/measurement-sources/normalization.ts";
import { measurementSourceMakesDerivedValueStale } from "../lib/measurement-sources/health.ts";

const mapping = {
  id: "e4030000-0000-4000-8000-000000000011",
  valueField: "properties.duration_ms",
  timestampField: "updatedAt",
  externalIdField: "id",
  transformKind: "duration_ms_to_seconds",
  scaleFactor: 1,
  offsetValue: 0,
  aggregationMethod: "average",
  periodGranularity: "day",
};

test("provider field reads are bounded to simple object paths", () => {
  assert.equal(readProviderField({ properties: { amount: 42 } }, "properties.amount"), 42);
  assert.throws(() => readProviderField({}, "constructor.prototype"), /Unsafe|numeric/);
  assert.throws(() => readProviderField({}, "items[0].value"), /Unsafe/);
});

test("provider records normalize and aggregate without retaining raw payloads", () => {
  const observations = normalizeProviderRecords([
    { id: "first", updatedAt: "2026-11-25T12:00:00Z", properties: { duration_ms: 2_000 }, customerEmail: "not retained@example.invalid" },
    { id: "second", updatedAt: "2026-11-25T13:00:00Z", properties: { duration_ms: 4_000 }, privateNote: "not retained" },
  ], mapping);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].rawValue, 3_000);
  assert.equal(applyMappingTransform(observations[0].rawValue, mapping), 3);
  assert.equal(observations[0].sampleSize, 2);
  assert.equal(observations[0].periodStart, "2026-11-25");
  assert.equal(JSON.stringify(observations).includes("customerEmail"), false);
  assert.equal(JSON.stringify(observations).includes("privateNote"), false);
});

test("normalization rejects nonnumeric mapped values and produces stable digests", () => {
  assert.throws(() => normalizeProviderRecords([{ id: "bad", updatedAt: "2026-11-25T12:00:00Z", properties: { duration_ms: "unknown" } }], mapping), /numeric/);
  assert.equal(sourcePayloadDigest({ id: 1 }), sourcePayloadDigest({ id: 1 }));
  assert.notEqual(sourcePayloadDigest({ id: 1 }), sourcePayloadDigest({ id: 2 }));
});

test("count and median are constrained auditable aggregations", () => {
  const countMapping = { ...mapping, valueField: "id", aggregationMethod: "count" };
  const count = normalizeProviderRecords([
    { id: "nonnumeric-a", updatedAt: "2026-11-25T12:00:00Z" },
    { id: "nonnumeric-b", updatedAt: "2026-11-25T13:00:00Z" },
  ], countMapping);
  assert.equal(count[0].rawValue, 2);
  const median = normalizeProviderRecords([
    { id: "1", updatedAt: "2026-11-25T12:00:00Z", properties: { duration_ms: 100 } },
    { id: "2", updatedAt: "2026-11-25T13:00:00Z", properties: { duration_ms: 900 } },
    { id: "3", updatedAt: "2026-11-25T14:00:00Z", properties: { duration_ms: 300 } },
  ], { ...mapping, aggregationMethod: "median" });
  assert.equal(median[0].rawValue, 300);
});

test("source health propagates to derived economic-input freshness", () => {
  assert.equal(measurementSourceMakesDerivedValueStale("healthy"), false);
  for (const status of ["configured", "stale", "degraded", "failed", "authentication_required", "disabled"]) {
    assert.equal(measurementSourceMakesDerivedValueStale(status), true);
  }
  assert.equal(measurementSourceMakesDerivedValueStale(null), false);
});
