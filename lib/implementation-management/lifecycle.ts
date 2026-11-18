import type { ImplementationStatus } from "./types";

const transitions: Record<ImplementationStatus, readonly ImplementationStatus[]> = {
  planning: ["architecture", "paused", "retired"],
  architecture: ["development", "paused", "retired"],
  development: ["internal_testing", "paused"],
  internal_testing: ["development", "client_acceptance", "paused"],
  client_acceptance: ["development", "internal_testing", "ready_for_deployment", "paused"],
  ready_for_deployment: ["client_acceptance", "deployed", "paused"],
  deployed: ["monitoring", "paused", "retired"],
  monitoring: ["paused", "retired"],
  paused: ["retired"],
  retired: [],
};

export function allowedImplementationTransitions(status: ImplementationStatus, statusBeforePause?: ImplementationStatus | null) {
  return status === "paused" && statusBeforePause
    ? [statusBeforePause, "retired"] as ImplementationStatus[]
    : [...transitions[status]];
}

export function implementationReadiness(input: {
  parentApproved: boolean;
  requiredTests: { status: string }[];
  requiredCriteria: { status: string }[];
  acceptanceApproved: boolean;
}) {
  const testsPresent = input.requiredTests.length > 0;
  const criteriaPresent = input.requiredCriteria.length > 0;
  const testsPass = testsPresent && input.requiredTests.every((test) => test.status === "passed");
  const criteriaPass = criteriaPresent && input.requiredCriteria.every((criterion) => criterion.status === "accepted");
  return {
    parentApproved: input.parentApproved,
    testsPresent,
    testsPass,
    criteriaPresent,
    criteriaPass,
    acceptanceApproved: input.acceptanceApproved,
    ready: input.parentApproved && testsPass && criteriaPass && input.acceptanceApproved,
  };
}
