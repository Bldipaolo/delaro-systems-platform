import type { ClientOperationalModel, OperatingProcess, ProcessStep } from "./types";

const organizationId = "demo-northstar";
const teamOwner: Record<string, string> = { commercial: "maya-membership", planning: "elliot-membership", delivery: "sam-membership", "finance-team": "alex-membership" };
const area = (id: string, name: string, sortOrder: number) => ({ id, organizationId, name, description: null, sortOrder });
const areas = [area("sales", "Sales", 1), area("operations", "Operations", 2), area("finance", "Finance", 3)];

const teams = [
  { id: "commercial", organizationId, name: "Commercial team", description: "Sales and customer commitments", ownerMembershipId: teamOwner.commercial, sortOrder: 1, clientVisible: true },
  { id: "planning", organizationId, name: "Production planning", description: "Capacity and job sequencing", ownerMembershipId: teamOwner.planning, sortOrder: 2, clientVisible: true },
  { id: "delivery", organizationId, name: "Delivery team", description: "Production and dispatch", ownerMembershipId: teamOwner.delivery, sortOrder: 3, clientVisible: true },
  { id: "finance-team", organizationId, name: "Finance team", description: "Billing and collections", ownerMembershipId: teamOwner["finance-team"], sortOrder: 4, clientVisible: true },
];
const people = [
  { id: "maya", organizationId, membershipId: "maya-membership", displayName: "Maya Chen", title: "Commercial lead", clientVisible: true },
  { id: "elliot", organizationId, membershipId: "elliot-membership", displayName: "Elliot Stone", title: "Planning lead", clientVisible: true },
  { id: "sam", organizationId, membershipId: "sam-membership", displayName: "Sam Rivera", title: "Delivery lead", clientVisible: true },
  { id: "alex", organizationId, membershipId: "alex-membership", displayName: "Alex Morgan", title: "Finance lead", clientVisible: true },
];

function process(id: string, operationalAreaId: string, name: string, sortOrder: number, trigger: string, output: string, downstream: string, ownerTeamId: string): OperatingProcess {
  return { id, organizationId, operationalAreaId, name, description: null, ownerMembershipId: teamOwner[ownerTeamId] ?? null, ownerTeamId, status: "active", sortOrder, triggerDescription: trigger, expectedOutput: output, downstreamEffect: downstream, clientVisible: true };
}

const processes = [
  process("lead-intake", "sales", "Lead intake", 1, "A new enquiry arrives", "Captured enquiry", "Qualification can begin", "commercial"),
  process("qualification", "sales", "Qualification", 2, "An enquiry is captured", "Qualified requirement", "Proposal work can begin", "commercial"),
  process("proposal", "sales", "Proposal", 3, "Requirements are qualified", "Customer proposal", "Commercial review can begin", "commercial"),
  process("contracting", "sales", "Contracting", 4, "A proposal is accepted", "Signed customer agreement", "Order details move to operations", "commercial"),
  process("order-handoff", "operations", "Order handoff", 1, "Customer agreement is signed", "Planning-ready work order", "Production scheduling can commit capacity", "planning"),
  process("scheduling", "operations", "Scheduling", 2, "A work order is ready", "Committed production slot", "Delivery team receives the build plan", "planning"),
  process("delivery-process", "operations", "Delivery", 3, "Production is complete", "Confirmed shipment and receipt", "Finance can issue the final invoice", "delivery"),
  process("billing", "finance", "Billing", 1, "Delivery is confirmed", "Customer invoice", "Collections clock begins", "finance-team"),
  process("collections", "finance", "Collections", 2, "An invoice reaches its due date", "Settled account", "Cash position and customer record are updated", "finance-team"),
];

function step(id: string, processId: string, stepType: ProcessStep["stepType"], name: string, sortOrder: number, ownerTeamId: string, options: Partial<ProcessStep> = {}): ProcessStep {
  return {
    id, organizationId, processId, stepType, name, description: null, sortOrder,
    ownerMembershipId: teamOwner[ownerTeamId] ?? null, ownerTeamId, automationMode: "manual", expectedDurationMinutes: null,
    actualDurationMinutes: null, approvalRequired: false, decisionCriteria: null, notes: null,
    clientVisible: true, ...options,
  };
}

const steps: ProcessStep[] = [
  step("handoff-input", "order-handoff", "input", "Receive approved quote and signed terms", 1, "commercial", { description: "Commercial sends the accepted scope, price, delivery date, and customer requirements.", expectedDurationMinutes: 20 }),
  step("handoff-review", "order-handoff", "process", "Check specifications and capacity", 2, "planning", { description: "Planning reconciles quote details with material availability and the current production plan.", expectedDurationMinutes: 45, actualDurationMinutes: 95, notes: "Missing specifications are often clarified by email." }),
  step("handoff-decision", "order-handoff", "decision", "Is the order ready to release?", 3, "planning", { decisionCriteria: "Specifications complete, materials identified, and promised date feasible.", approvalRequired: true, expectedDurationMinutes: 15 }),
  step("handoff-action", "order-handoff", "action", "Release the work order", 4, "planning", { description: "Resolve exceptions with Sales before the job enters the live schedule.", expectedDurationMinutes: 30 }),
  step("handoff-output", "order-handoff", "output", "Publish planning-ready order", 5, "planning", { description: "A complete order packet becomes the scheduling input.", automationMode: "assisted" }),
  step("schedule-input", "scheduling", "input", "Receive planning-ready order", 1, "planning"),
  step("schedule-decision", "scheduling", "decision", "Can capacity meet the promised date?", 2, "planning", { approvalRequired: true, decisionCriteria: "Material and machine capacity are available." }),
  step("schedule-output", "scheduling", "output", "Commit production slot", 3, "planning"),
  step("billing-input", "billing", "input", "Receive proof of delivery", 1, "finance-team"),
  step("billing-process", "billing", "process", "Reconcile order and shipment", 2, "finance-team"),
  step("billing-output", "billing", "output", "Issue invoice", 3, "finance-team"),
  ...processes.filter((item) => !["order-handoff", "scheduling", "billing"].includes(item.id)).flatMap((item) => [
    step(`${item.id}-input`, item.id, "input", `Receive ${item.triggerDescription?.toLowerCase()}`, 1, item.ownerTeamId ?? "commercial"),
    step(`${item.id}-process`, item.id, "process", `Complete ${item.name.toLowerCase()}`, 2, item.ownerTeamId ?? "commercial"),
    step(`${item.id}-output`, item.id, "output", item.expectedOutput ?? "Completed work", 3, item.ownerTeamId ?? "commercial"),
  ]),
];

const systems = [
  { id: "crm", organizationId, name: "Customer CRM", category: "Commercial", vendor: null, systemOfRecord: true, description: "Customer agreements and quote history", integrationStatus: "partial" as const, clientVisible: true },
  { id: "erp", organizationId, name: "Production ERP", category: "Operations", vendor: null, systemOfRecord: true, description: "Work orders and production schedule", integrationStatus: "partial" as const, clientVisible: true },
  { id: "shared-drive", organizationId, name: "Shared order folder", category: "Documents", vendor: null, systemOfRecord: false, description: "Supporting specifications and approvals", integrationStatus: "not_integrated" as const, clientVisible: true },
];

const dataAssets = [
  { id: "approved-quote", organizationId, systemId: "crm", name: "Approved quote", category: "Commercial record", description: "Price, scope, and delivery commitment", sourceDescription: "Customer CRM", dataFormat: "Record", clientVisible: true },
  { id: "specification", organizationId, systemId: "shared-drive", name: "Technical specification", category: "Order input", description: "Drawings and material requirements", sourceDescription: "Shared order folder", dataFormat: "Document", clientVisible: true },
  { id: "work-order", organizationId, systemId: "erp", name: "Work order", category: "Operations record", description: "Planning-ready production instruction", sourceDescription: "Production ERP", dataFormat: "Record", clientVisible: true },
];

const constraints = [
  { id: "spec-gap", organizationId, processId: "order-handoff", stepId: "handoff-review", systemId: null, issueDescription: "Approved quotes reach planning without a complete specification.", severity: "high" as const, frequency: "frequent" as const, status: "investigating" as const, clientVisible: true },
  { id: "capacity-gap", organizationId, processId: "scheduling", stepId: "schedule-decision", systemId: "erp", issueDescription: "Capacity is reconciled manually before a delivery date can be committed.", severity: "medium" as const, frequency: "frequent" as const, status: "planned" as const, clientVisible: true },
  { id: "billing-gap", organizationId, processId: "billing", stepId: "billing-process", systemId: null, issueDescription: "Shipment confirmation reaches Finance after delivery.", severity: "medium" as const, frequency: "occasional" as const, status: "open" as const, clientVisible: true },
];

export const demoOperationalModel: ClientOperationalModel = {
  organizationId, areas, teams, people, processes, steps, systems, dataAssets, constraints,
  processSystems: [
    { id: "ps-crm", organizationId, processId: "order-handoff", systemId: "crm", usageRole: "Quote source", notes: null, clientVisible: true },
    { id: "ps-erp", organizationId, processId: "order-handoff", systemId: "erp", usageRole: "Work-order record", notes: null, clientVisible: true },
  ],
  stepSystems: [
    { id: "ss-crm", organizationId, stepId: "handoff-input", systemId: "crm", usageRole: "Retrieve agreement", notes: null, clientVisible: true },
    { id: "ss-drive", organizationId, stepId: "handoff-review", systemId: "shared-drive", usageRole: "Review drawings", notes: null, clientVisible: true },
    { id: "ss-erp", organizationId, stepId: "handoff-action", systemId: "erp", usageRole: "Release order", notes: null, clientVisible: true },
  ],
  stepData: [
    { id: "data-quote", organizationId, stepId: "handoff-input", dataAssetId: "approved-quote", direction: "input", notes: null, clientVisible: true },
    { id: "data-spec", organizationId, stepId: "handoff-review", dataAssetId: "specification", direction: "input", notes: null, clientVisible: true },
    { id: "data-order", organizationId, stepId: "handoff-output", dataAssetId: "work-order", direction: "output", notes: null, clientVisible: true },
  ],
  handoffs: [
    { id: "sales-planning", organizationId, sourceStepId: "contracting-output", sourceTeamId: "commercial", destinationStepId: "handoff-input", destinationTeamId: "planning", informationTransferred: "Signed terms, scope, drawings, and target date", handoffMethod: "Email and shared folder", delayMinutes: 180, failureRatePercent: 18, notes: "Planning often requests clarification.", clientVisible: true },
    { id: "planning-schedule", organizationId, sourceStepId: "handoff-output", sourceTeamId: "planning", destinationStepId: "schedule-input", destinationTeamId: "planning", informationTransferred: "Released work order", handoffMethod: "ERP queue", delayMinutes: 25, failureRatePercent: null, notes: null, clientVisible: true },
  ],
  processDependencies: [
    { id: "contract-order", organizationId, upstreamProcessId: "contracting", downstreamProcessId: "order-handoff", conditionDescription: "Signed agreement available", notes: null, clientVisible: true },
    { id: "order-schedule", organizationId, upstreamProcessId: "order-handoff", downstreamProcessId: "scheduling", conditionDescription: "Work order released", notes: null, clientVisible: true },
  ],
  stepDependencies: [
    { id: "review-decision", organizationId, upstreamStepId: "handoff-review", downstreamStepId: "handoff-decision", conditionDescription: "Specifications checked", notes: null, clientVisible: true },
  ],
  metrics: [
    { id: "handoff-time", organizationId, processId: "order-handoff", stepId: null, name: "Quote-to-schedule time", definition: "Elapsed time from signed agreement to a committed production slot", unit: "hours", desiredDirection: "decrease", baselineValue: 28, targetValue: 12, actualValue: 24, actualMeasuredAt: "2026-10-06T12:00:00.000Z", clientVisible: true },
    { id: "handoff-completeness", organizationId, processId: "order-handoff", stepId: "handoff-review", name: "Complete order packets", definition: "Share of approved orders with all required specifications", unit: "%", desiredDirection: "increase", baselineValue: 62, targetValue: 95, actualValue: 68, actualMeasuredAt: "2026-10-06T12:00:00.000Z", clientVisible: true },
    { id: "schedule-reliability", organizationId, processId: "scheduling", stepId: null, name: "Schedule reliability", definition: "Orders committed by the promised date", unit: "%", desiredDirection: "increase", baselineValue: 76, targetValue: 90, actualValue: 79, actualMeasuredAt: "2026-10-06T12:00:00.000Z", clientVisible: true },
  ],
  publications: [
    { organizationId, constraintId: "spec-gap", rootCauseSummary: "Quote and planning records use different required-field checklists.", businessConsequenceSummary: "Planning pauses while Sales confirms details, delaying the production slot.", measuredDelayMinutes: 180, opportunitySummaryId: "opp-summary-handoff", initiativeId: "initiative-quote-order" },
    { organizationId, constraintId: "capacity-gap", rootCauseSummary: "Current capacity is spread across the ERP and an offline planning sheet.", businessConsequenceSummary: "Promised dates are harder to confirm with confidence.", measuredDelayMinutes: 90, opportunitySummaryId: "opp-summary-capacity", initiativeId: "initiative-capacity" },
    { organizationId, constraintId: "billing-gap", rootCauseSummary: "Delivery confirmation is sent after the dispatch handoff.", businessConsequenceSummary: "Invoices begin later than they could.", measuredDelayMinutes: null, opportunitySummaryId: null, initiativeId: null },
  ],
  opportunitySummaries: [
    { id: "opp-summary-handoff", organizationId, title: "Standardize the quote-to-order handoff", summary: "One complete order packet before work enters planning.", priority: "High", status: "Prioritized" },
    { id: "opp-summary-capacity", organizationId, title: "Create a dependable capacity view", summary: "Use one shared view of committed and available capacity.", priority: "Medium", status: "Qualified" },
  ],
  improvements: [
    { id: "initiative-quote-order", organizationId, title: "Quote-to-order handoff", status: "On track" },
    { id: "initiative-capacity", organizationId, title: "Capacity visibility", status: "At risk" },
  ],
};
