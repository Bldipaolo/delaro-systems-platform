import test from "node:test";
import assert from "node:assert/strict";
import { connectionState, durationLabel } from "../lib/workflow-observability/types.ts";
import { createIntegrationToken, maxWorkflowEventBytes, parseIntegrationToken, sanitizeErrorSummary, workflowEventSchema } from "../lib/workflow-observability/protocol.ts";
import { parseWorkflowReference } from "../lib/workflow-observability/registration.ts";
import { workflowAnalytics, workflowAttention } from "../lib/workflow-observability/analytics.ts";

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
    "[credential redacted] [email redacted] [url redacted]",
  );
  assert.equal(
    sanitizeErrorSummary("api_key=live-secret password:unsafe 192.168.1.20"),
    "api_key=[redacted] password=[redacted] [network address redacted]",
  );
});

test("n8n templates are importable JSON and never contain a Delaro secret", async () => {
  const { readFile } = await import("node:fs/promises");
  const names = ["delaro-success-reporter", "delaro-error-reporter", "delaro-controlled-failure-test"];
  const templates = await Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(`../public/integrations/n8n/${name}.json`, import.meta.url), "utf8"))));
  for (const template of templates) {
    assert.equal(typeof template.name, "string");
    assert.equal(Array.isArray(template.nodes), true);
    assert.equal(template.active, false);
    assert.doesNotMatch(JSON.stringify(template), /delaro_n8n_[0-9a-f-]{36}\./i);
  }
  const success = templates[0];
  assert.equal(success.nodes.some((node) => node.name === "Report Success to Delaro"), true);
  const failure = templates[1];
  assert.equal(failure.nodes[0].type, "n8n-nodes-base.errorTrigger");
  assert.match(JSON.stringify(failure), /n8n_error_trigger/);
  assert.match(JSON.stringify(failure), /trigger-/);
  const controlled = templates[2];
  assert.equal(controlled.nodes.some((node) => node.type === "n8n-nodes-base.stopAndError"), true);
});

test("durations remain readable across execution scales", () => {
  assert.equal(durationLabel(null), "Not available");
  assert.equal(durationLabel(420), "420 ms");
  assert.equal(durationLabel(4_200), "4.2 sec");
  assert.equal(durationLabel(92_000), "1 min 32 sec");
});

const analyticsWorkflow = {
  id: "workflow-1", implementationId: null, name: "Order sync", purpose: null, environment: "production",
  operationalStatus: "active", monitoringStatus: "degraded", lastSuccessAt: "2026-11-23T12:00:00Z",
  lastFailureAt: "2026-11-24T12:00:00Z", lastReportedAt: "2026-11-24T12:00:00Z", lastExecutionStatus: "failed",
  executionCount: 3, successCount: 2, failureCount: 1, averageDurationMs: 2000, demo: false,
  executions: [
    { id: "success", workflowId: "workflow-1", externalExecutionId: "1", status: "successful", startedAt: "2026-11-23T11:59:58Z", finishedAt: "2026-11-23T12:00:00Z", durationMs: 2000, errorCode: null, errorSummary: null, monitoringSource: "n8n_workflow_reporter", lastEventAt: "2026-11-23T12:00:00Z", lastReceivedAt: "2026-11-23T12:00:00Z" },
    { id: "failure", workflowId: "workflow-1", externalExecutionId: "2", status: "failed", startedAt: "2026-11-24T11:59:56Z", finishedAt: "2026-11-24T12:00:00Z", durationMs: 4000, errorCode: "TEST", errorSummary: "Controlled failure", monitoringSource: "n8n_error_trigger", lastEventAt: "2026-11-24T12:00:00Z", lastReceivedAt: "2026-11-24T12:00:00Z" },
    { id: "old", workflowId: "workflow-1", externalExecutionId: "0", status: "successful", startedAt: "2026-10-01T12:00:00Z", finishedAt: "2026-10-01T12:00:01Z", durationMs: 1000, errorCode: null, errorSummary: null, monitoringSource: "n8n_workflow_reporter", lastEventAt: "2026-10-01T12:00:01Z", lastReceivedAt: "2026-10-01T12:00:01Z" },
  ],
};

test("workflow analytics group authenticated history without counting out-of-period events", () => {
  const analytics = workflowAnalytics([analyticsWorkflow], "7d", new Date("2026-11-24T18:00:00Z"));
  assert.equal(analytics.total, 2);
  assert.equal(analytics.successful, 1);
  assert.equal(analytics.failed, 1);
  assert.equal(analytics.successRate, 0.5);
  assert.equal(analytics.averageDurationMs, 3000);
  assert.equal(analytics.series.length, 7);
  assert.equal(analytics.series.reduce((sum, point) => sum + point.total, 0), 2);
});

test("attention feed includes only failed executions and remains newest first", () => {
  const attention = workflowAttention([analyticsWorkflow]);
  assert.deepEqual(attention.map((item) => item.execution.id), ["failure"]);
});

test("command-center workflow layouts retain narrow-screen alternatives", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.command-grid \{ grid-template-columns: 1fr;/);
  assert.match(css, /\.workflow-toolbar \{ grid-template-columns: 1fr;/);
  assert.match(css, /\.activity-workflow-list > a \{ grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
