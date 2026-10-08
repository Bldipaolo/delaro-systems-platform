import type { ClientDecision } from "./types";

const demoHistory = (id: string): ClientDecision["history"] => [{ id: `${id}-opened`, summary: "Decision opened", occurredAt: "2026-10-08T12:00:00.000Z" }];

export const demoDecisions: ClientDecision[] = [
  {
    id: "source-system", kind: "approval", riskLevel: "standard", status: "open",
    title: "Source-system confirmation required",
    context: "Capacity visibility cannot move forward until the source-of-truth dataset is confirmed.",
    whyNeeded: "Two scheduling views currently disagree on committed production capacity.",
    recommendation: "Use the ERP production schedule as the source of truth for the first measurement period.",
    financialConsequence: null,
    operationalConsequence: "Without a confirmed source, capacity reporting may give teams conflicting answers.",
    dueDate: "2026-10-14", requestedBy: "Delaro team", relatedProcessId: null, relatedOpportunityId: null,
    relatedImprovementId: "initiative-capacity", selectedOutcome: null, decidedAt: null,
    options: [
      { id: "erp", title: "ERP production schedule", description: "Use the current production schedule as the agreed source.", consequence: "One consistent starting point for capacity measurement.", recommended: true },
      { id: "planning", title: "Planning worksheet", description: "Use the operations planning worksheet while ERP data is reconciled.", consequence: "Manual reconciliation remains necessary.", recommended: false },
    ],
    approvalId: "source-system-approval", approvalStatus: "pending", assignedToCurrentUser: true, canRespond: true, canDiscuss: true,
    comments: [], history: demoHistory("source-system"), demo: true,
  },
  {
    id: "handoff-proposal", kind: "recommendation", riskLevel: "elevated", status: "open",
    title: "Improvement proposal ready",
    context: "The quote-to-order handoff proposal is ready for client review.",
    whyNeeded: "Implementation should not begin before the scope and business case are accepted.",
    recommendation: "Review the business case and confirm the proposed implementation scope.",
    financialConsequence: "Economic estimates are pending client validation; no realized value is claimed.",
    operationalConsequence: "Approval would authorize the agreed handoff changes; no work is triggered automatically in demo mode.",
    dueDate: "2026-10-17", requestedBy: "Delaro team", relatedProcessId: null, relatedOpportunityId: null,
    relatedImprovementId: "initiative-quote-order", selectedOutcome: null, decidedAt: null,
    options: [{ id: "scope", title: "Approve proposed scope", description: "Proceed only with the reviewed implementation scope.", consequence: "The team may plan the next phase.", recommended: true }],
    approvalId: "handoff-proposal-approval", approvalStatus: "pending", assignedToCurrentUser: true, canRespond: true, canDiscuss: true,
    comments: [], history: demoHistory("handoff-proposal"), demo: true,
  },
];
