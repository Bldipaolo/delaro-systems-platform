export type ProcessStatus = "draft" | "active" | "paused" | "retired";
export type ProcessStepType = "input" | "process" | "decision" | "action" | "output";
export type AutomationMode = "manual" | "assisted" | "automated";
export type IntegrationStatus = "unknown" | "not_integrated" | "planned" | "partial" | "integrated";
export type ConstraintSeverity = "low" | "medium" | "high" | "critical";
export type ConstraintFrequency = "rare" | "occasional" | "frequent" | "continuous";
export type ConstraintStatus = "open" | "investigating" | "planned" | "resolved";
export type MetricDirection = "increase" | "decrease" | "maintain";

export type TenantRecord = {
  id: string;
  organizationId: string;
};

export type OperationalArea = TenantRecord & {
  name: string;
  description: string | null;
  sortOrder: number;
};

export type OperationalTeam = TenantRecord & {
  name: string;
  description: string | null;
  ownerMembershipId: string | null;
  sortOrder: number;
  clientVisible: boolean;
};

export type OperationalTeamMember = {
  organizationId: string;
  teamId: string;
  membershipId: string;
  roleDescription: string | null;
};

export type OperationalPerson = TenantRecord & {
  membershipId: string;
  displayName: string;
  title: string | null;
  clientVisible: boolean;
};

export type OperatingProcess = TenantRecord & {
  operationalAreaId: string;
  name: string;
  description: string | null;
  ownerMembershipId: string | null;
  ownerTeamId: string | null;
  status: ProcessStatus;
  sortOrder: number;
  triggerDescription: string | null;
  expectedOutput: string | null;
  downstreamEffect: string | null;
  clientVisible: boolean;
};

export type ProcessStep = TenantRecord & {
  processId: string;
  stepType: ProcessStepType;
  name: string;
  description: string | null;
  sortOrder: number;
  ownerMembershipId: string | null;
  ownerTeamId: string | null;
  automationMode: AutomationMode;
  expectedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  approvalRequired: boolean;
  decisionCriteria: string | null;
  notes: string | null;
  clientVisible: boolean;
};

export type OperatingSystem = TenantRecord & {
  name: string;
  category: string | null;
  vendor: string | null;
  systemOfRecord: boolean;
  description: string | null;
  integrationStatus: IntegrationStatus;
  clientVisible: boolean;
};

export type ProcessSystem = TenantRecord & {
  processId: string;
  systemId: string;
  usageRole: string | null;
  notes: string | null;
  clientVisible: boolean;
};

export type ProcessStepSystem = TenantRecord & {
  stepId: string;
  systemId: string;
  usageRole: string | null;
  notes: string | null;
  clientVisible: boolean;
};

export type DataAsset = TenantRecord & {
  systemId: string | null;
  name: string;
  category: string | null;
  description: string | null;
  sourceDescription: string | null;
  dataFormat: string | null;
  clientVisible: boolean;
};

export type ProcessStepData = TenantRecord & {
  stepId: string;
  dataAssetId: string;
  direction: "input" | "output";
  notes: string | null;
  clientVisible: boolean;
};

export type Handoff = TenantRecord & {
  sourceStepId: string | null;
  sourceTeamId: string | null;
  destinationStepId: string | null;
  destinationTeamId: string | null;
  informationTransferred: string;
  handoffMethod: string | null;
  delayMinutes: number | null;
  failureRatePercent: number | null;
  notes: string | null;
  clientVisible: boolean;
};

export type ProcessDependency = TenantRecord & {
  upstreamProcessId: string;
  downstreamProcessId: string;
  conditionDescription: string | null;
  notes: string | null;
  clientVisible: boolean;
};

export type StepDependency = TenantRecord & {
  upstreamStepId: string;
  downstreamStepId: string;
  conditionDescription: string | null;
  notes: string | null;
  clientVisible: boolean;
};

export type ProcessConstraint = TenantRecord & {
  processId: string | null;
  stepId: string | null;
  systemId: string | null;
  issueDescription: string;
  severity: ConstraintSeverity;
  frequency: ConstraintFrequency;
  status: ConstraintStatus;
  clientVisible: boolean;
};

export type ConstraintDiagnostic = {
  organizationId: string;
  constraintId: string;
  rootCause: string | null;
  businessConsequence: string | null;
  opportunityId: string | null;
  internalNotes: string | null;
};

export type ConstraintPublication = {
  organizationId: string;
  constraintId: string;
  rootCauseSummary: string | null;
  businessConsequenceSummary: string | null;
  measuredDelayMinutes: number | null;
  opportunitySummaryId: string | null;
  initiativeId: string | null;
};

export type ClientOpportunitySummary = TenantRecord & {
  title: string;
  summary: string;
  priority: string;
  status: string;
};

export type LinkedImprovement = TenantRecord & {
  title: string;
  status: string;
};

export type ProcessMetric = TenantRecord & {
  processId: string;
  stepId: string | null;
  name: string;
  definition: string | null;
  unit: string;
  desiredDirection: MetricDirection;
  baselineValue: number | null;
  targetValue: number | null;
  actualValue: number | null;
  actualMeasuredAt: string | null;
  clientVisible: boolean;
};

export type ClientOperationalModel = {
  organizationId: string | null;
  areas: OperationalArea[];
  teams: OperationalTeam[];
  people: OperationalPerson[];
  processes: OperatingProcess[];
  steps: ProcessStep[];
  systems: OperatingSystem[];
  dataAssets: DataAsset[];
  constraints: ProcessConstraint[];
  metrics: ProcessMetric[];
  processSystems: ProcessSystem[];
  stepSystems: ProcessStepSystem[];
  stepData: ProcessStepData[];
  handoffs: Handoff[];
  processDependencies: ProcessDependency[];
  stepDependencies: StepDependency[];
  publications: ConstraintPublication[];
  opportunitySummaries: ClientOpportunitySummary[];
  improvements: LinkedImprovement[];
};

export type InternalOperationalModel = ClientOperationalModel & {
  teamMembers: OperationalTeamMember[];
  diagnostics: ConstraintDiagnostic[];
};
