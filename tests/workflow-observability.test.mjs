import test from "node:test";
import assert from "node:assert/strict";
import { connectionState, durationLabel } from "../lib/workflow-observability/types.ts";
import { createIntegrationToken, maxWorkflowEventBytes, parseIntegrationToken, sanitizeErrorSummary, workflowEventSchema } from "../lib/workflow-observability/protocol.ts";
import { parseWorkflowReference } from "../lib/workflow-observability/registration.ts";

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
  assert.equal(connectionState("degraded", "2026-11-21T11:55:00Z", now), "degraded");
  assert.equal(connectionState("degraded", "2026-11-19T10:00:00Z", now), "stale");
  assert.equal(connectionState("disabled", "2026-11-21T11:55:00Z", now), "disabled");
});

test("n8n registration accepts IDs and safe workflow URLs without retaining URL secrets", () => {
  assert.deepEqual(parseWorkflowReference("n8n_cloud", "cloud-workflow_12"), {
    externalWorkflowId: "cloud-workflow_12", instanceReference: "n8n Cloud", workflowUrl: null,
  });
  assert.deepEqual(parseWorkflowReference("n8n_cloud", "https://delaro.app.n8n.cloud/workflow/abc_123?view=1#node"), {
    externalWorkflowId: "abc_123", instanceReference: "delaro.app.n8n.cloud", workflowUrl: "https://delaro.app.n8n.cloud/workflow/abc_123",
  });
  assert.deepEqual(parseWorkflowReference("n8n_self_hosted", "https://automation.example.com/workflow/run-9"), {
    externalWorkflowId: "run-9", instanceReference: "automation.example.com", workflowUrl: "https://automation.example.com/workflow/run-9",
  });
  for (const invalid of [
    ["n8n_cloud", "http://delaro.app.n8n.cloud/workflow/abc"],
    ["n8n_cloud", "https://user:secret@delaro.app.n8n.cloud/workflow/abc"],
    ["n8n_cloud", "https://example.com/workflow/abc"],
    ["n8n_self_hosted", "workflow-id-only"],
  ]) assert.throws(() => parseWorkflowReference(invalid[0], invalid[1]));
});

test("workflow onboarding remains usable on narrow screens", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.workflow-connect-panel \{ display: grid;/);
  assert.match(css, /\.workflow-organization-bar, \.workflow-connect-panel \{ grid-template-columns: 1fr;/);
  assert.match(css, /\.workflow-instructions li \{ grid-template-columns: 1fr; display: grid;/);
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
