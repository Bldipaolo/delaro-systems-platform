import test from "node:test";
import assert from "node:assert/strict";
import { allowedImplementationTransitions, implementationReadiness } from "../lib/implementation-management/lifecycle.ts";
import { monitoringLabel } from "../lib/implementation-management/types.ts";

test("implementation lifecycle exposes only deliberate forward and remediation transitions", () => {
  assert.deepEqual(allowedImplementationTransitions("planning"), ["architecture", "paused", "retired"]);
  assert.deepEqual(allowedImplementationTransitions("internal_testing"), ["development", "client_acceptance", "paused"]);
  assert.deepEqual(allowedImplementationTransitions("paused", "development"), ["development", "retired"]);
  assert.deepEqual(allowedImplementationTransitions("retired"), []);
});

test("deployment readiness requires approval, required tests, criteria, and client acceptance", () => {
  const complete = implementationReadiness({
    parentApproved: true,
    requiredTests: [{ status: "passed" }, { status: "passed" }],
    requiredCriteria: [{ status: "accepted" }],
    acceptanceApproved: true,
  });
  assert.equal(complete.ready, true);

  for (const incomplete of [
    { parentApproved: false, requiredTests: [{ status: "passed" }], requiredCriteria: [{ status: "accepted" }], acceptanceApproved: true },
    { parentApproved: true, requiredTests: [{ status: "failed" }], requiredCriteria: [{ status: "accepted" }], acceptanceApproved: true },
    { parentApproved: true, requiredTests: [{ status: "passed" }], requiredCriteria: [{ status: "pending" }], acceptanceApproved: true },
    { parentApproved: true, requiredTests: [{ status: "passed" }], requiredCriteria: [{ status: "accepted" }], acceptanceApproved: false },
    { parentApproved: true, requiredTests: [], requiredCriteria: [{ status: "accepted" }], acceptanceApproved: true },
    { parentApproved: true, requiredTests: [{ status: "passed" }], requiredCriteria: [], acceptanceApproved: true },
  ]) assert.equal(implementationReadiness(incomplete).ready, false);
});

test("monitoring absence is stated explicitly", () => {
  assert.equal(monitoringLabel("not_connected"), "Monitoring not connected");
  assert.equal(monitoringLabel("connected"), "connected");
});
