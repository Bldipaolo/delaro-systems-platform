import test from "node:test";
import assert from "node:assert/strict";
import { selectActiveMembership, assertActiveOrganizationId } from "../lib/auth/organization-selection.ts";
import { canAdministerOrganizations, canViewInternalWorkspace } from "../lib/auth/permissions.ts";
import { isUnauthenticatedServerEndpoint } from "../lib/auth/public-routes.ts";

const memberships = [
  { organizationId: "client-a", role: "client_admin" },
  { organizationId: "client-b", role: "delaro_consultant" },
];

test("an unknown or archived organization preference cannot select a foreign tenant", () => {
  const available = new Set(["client-a"]);
  assert.equal(selectActiveMembership(memberships, available, "foreign")?.organizationId, "client-a");
  assert.equal(selectActiveMembership(memberships, available, "client-b")?.organizationId, "client-a");
  assert.equal(selectActiveMembership(memberships, new Set(), "client-a"), null);
});

test("a valid preference can select another authorized organization", () => {
  assert.equal(selectActiveMembership(memberships, new Set(["client-a", "client-b"]), "client-b")?.organizationId, "client-b");
});

test("actions reject an organization ID different from the active context", () => {
  assert.doesNotThrow(() => assertActiveOrganizationId("client-a", "client-a"));
  assert.throws(() => assertActiveOrganizationId("client-a", "client-b"), /does not match/);
});

test("only Delaro roles can enter internal routes", () => {
  for (const role of ["delaro_admin", "delaro_consultant"]) assert.equal(canViewInternalWorkspace(role), true);
  for (const role of ["client_admin", "client_user", "read_only"]) assert.equal(canViewInternalWorkspace(role), false);
});

test("only Delaro administrators can provision organizations or manage client memberships", () => {
  assert.equal(canAdministerOrganizations("delaro_admin"), true);
  for (const role of ["delaro_consultant", "client_admin", "client_user", "read_only"]) {
    assert.equal(canAdministerOrganizations(role), false);
  }
});

test("only the exact credential-authenticated ingestion endpoint bypasses session middleware", () => {
  assert.equal(isUnauthenticatedServerEndpoint("/api/integrations/n8n/executions"), true);
  for (const path of ["/api/integrations/n8n", "/api/integrations/n8n/executions/other", "/workflows", "/internal/workflows"]) {
    assert.equal(isUnauthenticatedServerEndpoint(path), false);
  }
});
