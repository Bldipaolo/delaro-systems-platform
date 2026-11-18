export const implementationStatuses = [
  "planning",
  "architecture",
  "development",
  "internal_testing",
  "client_acceptance",
  "ready_for_deployment",
  "deployed",
  "monitoring",
  "paused",
  "retired",
] as const;

export type ImplementationStatus = (typeof implementationStatuses)[number];

export const implementationTypes = [
  "n8n_automation",
  "ai_processing",
  "integration",
  "internal_software",
  "reporting_dashboard",
  "data_infrastructure",
  "process_redesign",
  "human_decision_system",
  "other",
] as const;

export type ImplementationType = (typeof implementationTypes)[number];
export type MonitoringStatus = "not_connected" | "configured" | "connected" | "degraded" | "disabled";

export type ImplementationMilestone = {
  id: string;
  title: string;
  description: string | null;
  status: "Upcoming" | "In progress" | "Complete" | "Blocked";
  dueDate: string | null;
  completedDate: string | null;
  ownerName: string | null;
  clientVisible: boolean;
  acceptanceRequirements?: string | null;
  blockerDetails?: string | null;
};

export type ClientImplementation = {
  id: string;
  name: string;
  type: ImplementationType;
  solutionSummary: string | null;
  progressSummary: string | null;
  desiredOutcome: string;
  status: ImplementationStatus;
  ownerName: string | null;
  plannedDeploymentDate: string | null;
  actualDeploymentDate: string | null;
  monitoringStatus: MonitoringStatus;
  monitoringLabel: string;
  operationalHealth: string;
  lastObservedStatus: string | null;
  lastObservedAt: string | null;
  expectedOperatingCadence: string | null;
  supportResponsibility: string | null;
  milestones: ImplementationMilestone[];
  references: { id: string; title: string; type: string; reference: string; description: string | null }[];
};

export type InternalImplementation = ClientImplementation & {
  organizationId: string;
  initiativeId: string;
  initiativeTitle: string;
  operationalProblem: string;
  expectedBusinessImpact: string | null;
  ownerMembershipId: string | null;
  operationalOwnerMembershipId: string | null;
  escalationOwnerMembershipId: string | null;
  acceptanceDecisionId: string | null;
  technicalScope: string | null;
  operationalScope: string | null;
  architectureSummary: string | null;
  blockers: string | null;
  internalNotes: string | null;
  clientVisible: boolean;
  architecture: {
    authenticationMethod: string | null;
    credentialOwner: string;
    failureConditions: string | null;
    retryBehavior: string | null;
    loggingStrategy: string | null;
    monitoringStrategy: string | null;
    securityConsiderations: string | null;
    manualFallbackProcedure: string | null;
  } | null;
  architectureItems: {
    id: string;
    category: "input" | "processing" | "decision" | "output";
    itemType: string;
    name: string;
    description: string | null;
    systemId: string | null;
    sequence: number;
  }[];
  workflows: {
    id: string;
    platform: string;
    instanceReference: string;
    workflowId: string;
    name: string;
    purpose: string;
    environment: string;
    operationalStatus: string;
    monitoringStatus: MonitoringStatus;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
  }[];
  tests: {
    id: string;
    name: string;
    category: string;
    expectedBehavior: string;
    actualOutcome: string | null;
    status: "pending" | "passed" | "failed" | "blocked";
    required: boolean;
    executedAt: string | null;
    evidenceReference: string | null;
    remediation: string | null;
  }[];
  criteria: {
    id: string;
    title: string;
    expectedBehavior: string;
    required: boolean;
    status: "pending" | "accepted" | "rejected";
    reviewedAt: string | null;
  }[];
  deployments: {
    id: string;
    version: string;
    environment: string;
    deployedAt: string;
    acceptanceStatus: string;
    externalReference: string | null;
    knownLimitations: string | null;
    supportResponsibility: string;
  }[];
  linkedProcessIds: string[];
  linkedSystemIds: string[];
  linkedMetricIds: string[];
};

export const implementationStatusLabels: Record<ImplementationStatus, string> = {
  planning: "Planning",
  architecture: "Architecture",
  development: "Development",
  internal_testing: "Internal testing",
  client_acceptance: "Client acceptance",
  ready_for_deployment: "Ready for deployment",
  deployed: "Deployed",
  monitoring: "Monitoring",
  paused: "Paused",
  retired: "Retired",
};

export const implementationTypeLabels: Record<ImplementationType, string> = {
  n8n_automation: "n8n automation",
  ai_processing: "AI-assisted processing",
  integration: "Systems integration",
  internal_software: "Internal software",
  reporting_dashboard: "Reporting dashboard",
  data_infrastructure: "Data infrastructure",
  process_redesign: "Process redesign",
  human_decision_system: "Human decision system",
  other: "Other implementation",
};

export function monitoringLabel(status: MonitoringStatus) {
  return status === "not_connected" ? "Monitoring not connected" : status.replaceAll("_", " ");
}
