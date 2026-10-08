export type DecisionKind = "approval" | "question" | "exception" | "recommendation";
export type DecisionStatus = "open" | "in_discussion" | "changes_requested" | "approved" | "declined" | "resolved" | "cancelled";

export type DecisionOption = { id: string; title: string; description: string | null; consequence: string | null; recommended: boolean };
export type DecisionHistory = { id: string; summary: string; occurredAt: string };
export type DecisionComment = { id: string; body: string; author: string; createdAt: string };
export type ClientDecision = {
  id: string;
  kind: DecisionKind;
  riskLevel: "standard" | "elevated" | "high";
  status: DecisionStatus;
  title: string;
  context: string;
  whyNeeded: string;
  recommendation: string | null;
  financialConsequence: string | null;
  operationalConsequence: string | null;
  dueDate: string | null;
  requestedBy: string;
  relatedProcessId: string | null;
  relatedOpportunityId: string | null;
  relatedImprovementId: string | null;
  selectedOutcome: string | null;
  decidedAt: string | null;
  options: DecisionOption[];
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "changes_requested" | "declined" | null;
  assignedToCurrentUser: boolean;
  canRespond: boolean;
  canDiscuss: boolean;
  comments: DecisionComment[];
  history: DecisionHistory[];
  demo?: boolean;
};

export function needsAttention(decision: ClientDecision) {
  return decision.assignedToCurrentUser && (decision.approvalStatus === null || decision.approvalStatus === "pending")
    && ["open", "in_discussion"].includes(decision.status);
}
