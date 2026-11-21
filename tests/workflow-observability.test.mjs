import test from "node:test";
import assert from "node:assert/strict";
import { connectionState, durationLabel } from "../lib/workflow-observability/types.ts";
import { createIntegrationToken, maxWorkflowEventBytes, parseIntegrationToken, sanitizeErrorSummary, workflowEventSchema } from "../lib/workflow-observability/protocol.ts";

test("workflow integration tokens are parseable but do not reveal their stored hash", () => {
  const generated = createIntegrationToken();
  const parsed = parseIntegrationToken(`Bearer ${generated.token}`);
  assert.equal(parsed?.credentialId, generated.credentialId);
  assert.equal(parsed?.secretHash, generated.secretHash);
  assert.equal(generated.token.includes(generated.secretHash), false);
  for (const invalid of [null, "Bearer wrong", "Basic abc", "Bearer delaro_n8n_bad.secret"]) assert.equal(parseIntegrationToken(invalid), null);
});

test("execution protocol accepts bounded safe metadata and rejects inconsistent outcomes", () => {
  const valid = { eventId: "event-1", executionId: "execution-1", eventType: "completed", status: "successful", occurredAt: "2026-11-21T12:00:00Z", startedAt: "2026-11-21T11:59:58Z", finishedAt: "2026-11-21T12:00:00Z", durationMs: 2000, source: "n8n_workflow_reporter" };
  assert.equal(workflowEventSchema.safeParse(valid).success, true);
  assert.equal(workflowEventSchema.safeParse({ ...valid, status: "failed" }).success, false);
  assert.equal(workflowEventSchema.safeParse({ ...valid, payload: { customer: "must not be retained" } }).success, false);
  assert.equal(workflowEventSchema.safeParse({ ...valid, errorSummary: "x".repeat(501) }).success, false);
  assert.equal(maxWorkflowEventBytes, 32 * 1024);
});

test("freshness never implies connectivity without a recent authenticated event", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(connectionState("connected", "2026-11-21T11:55:00Z", now), "connected");
  assert.equal(connectionState("connected", "2026-11-19T10:00:00Z", now), "stale");
  assert.equal(connectionState("configured", "2026-11-21T11:55:00Z", now), "disconnected");
  assert.equal(connectionState("disabled", "2026-11-21T11:55:00Z", now), "disabled");
});

test("plain-language errors redact common credential and identity material", () => {
  assert.equal(
    sanitizeErrorSummary("Bearer abc.def client@example.com https://service.test/path?token=secret-value"),
    "[credential redacted] [email redacted] https://service.test/path?token=[redacted]",
  );
});

test("durations remain readable across execution scales", () => {
  assert.equal(durationLabel(null), "Not available");
  assert.equal(durationLabel(420), "420 ms");
  assert.equal(durationLabel(4_200), "4.2 sec");
  assert.equal(durationLabel(92_000), "1 min 32 sec");
});
