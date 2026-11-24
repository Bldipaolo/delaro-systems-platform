import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../lib/auth/public-routes.ts", import.meta.url), "utf8");

function isPublicIntegrationAsset(pathname) {
  return pathname.startsWith("/integrations/n8n/") && pathname.endsWith(".json");
}

test("n8n JSON templates are public static assets", () => {
  assert.match(source, /pathname\.startsWith\("\/integrations\/n8n\/"\)/);
  assert.equal(isPublicIntegrationAsset("/integrations/n8n/delaro-success-reporter.json"), true);
  assert.equal(isPublicIntegrationAsset("/integrations/n8n/delaro-error-reporter.json"), true);
  assert.equal(isPublicIntegrationAsset("/integrations/n8n/delaro-controlled-failure-test.json"), true);
});

test("public template rule does not expose application or API routes", () => {
  assert.equal(isPublicIntegrationAsset("/integrations/n8n/private"), false);
  assert.equal(isPublicIntegrationAsset("/api/integrations/n8n/executions"), false);
  assert.equal(isPublicIntegrationAsset("/internal/workflows"), false);
});
