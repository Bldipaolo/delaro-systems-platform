export type Role = "delaro_admin" | "delaro_consultant" | "client_admin" | "client_user" | "read_only";

export type InitiativeStatus = "On track" | "At risk" | "Complete";
export type OpportunityStatus = "Investigate" | "Qualified" | "Prioritized" | "Proposed" | "Approved" | "Implementing" | "Measuring" | "Complete" | "Rejected";
export type OpportunityPriority = "Low" | "Medium" | "High" | "Critical";

export type Opportunity = {
  id: string;
  title: string;
  process: string;
  consequence: string;
  estimatedAnnualValue: number | null;
  score: number;
  evidenceQuality: "Low" | "Medium" | "High";
  priority: OpportunityPriority;
  status: OpportunityStatus;
  owner: string;
  updatedAt: string;
};

export type Initiative = {
  id: string;
  title: string;
  objective: string;
  phase: string;
  owner: string;
  progress: number;
  nextMilestone: string;
  status: InitiativeStatus;
};

export type ClientOverview = {
  organizationName: string;
  organizationIndustry: string;
  priorities: string[];
  activeInitiatives: Initiative[];
  estimatedOpportunityValue: string;
  realizedValue: string;
};

export const demoOverview: ClientOverview = {
  organizationName: "Northstar Manufacturing",
  organizationIndustry: "Industrial manufacturing",
  priorities: [
    "Shorten the quote-to-order handoff",
    "Create reliable production capacity visibility",
    "Measure rework cost at the source",
  ],
  activeInitiatives: [
    {
      id: "initiative-quote-order",
      title: "Quote-to-order handoff",
      objective: "Reduce delay and ambiguity between commercial approval and production planning.",
      phase: "Design",
      owner: "Maya Chen",
      progress: 58,
      nextMilestone: "Validate handoff map · 10 Oct",
      status: "On track",
    },
    {
      id: "initiative-capacity",
      title: "Capacity visibility",
      objective: "Give operations a dependable view of committed and available production capacity.",
      phase: "Validation",
      owner: "Elliot Stone",
      progress: 31,
      nextMilestone: "Confirm source data · 14 Oct",
      status: "At risk",
    },
  ],
  estimatedOpportunityValue: "$—",
  realizedValue: "$—",
};

export const demoOpportunities: Opportunity[] = [
  { id: "opp-quote-handoff", title: "Quote-to-order handoff", process: "Sales → Operations", consequence: "Approved work waits for clarification before production planning can begin.", estimatedAnnualValue: null, score: 22, evidenceQuality: "Medium", priority: "High", status: "Prioritized", owner: "Maya Chen", updatedAt: "2026-10-06T12:00:00.000Z" },
  { id: "opp-capacity", title: "Capacity visibility", process: "Production planning", consequence: "Committed capacity is difficult to reconcile with the current production view.", estimatedAnnualValue: null, score: 18, evidenceQuality: "Low", priority: "Medium", status: "Qualified", owner: "Elliot Stone", updatedAt: "2026-10-02T12:00:00.000Z" },
  { id: "opp-rework", title: "Rework cost at source", process: "Quality → Finance", consequence: "Rework is visible after the fact, limiting confidence in the cost of recurring defects.", estimatedAnnualValue: null, score: 16, evidenceQuality: "Low", priority: "Medium", status: "Investigate", owner: "Maya Chen", updatedAt: "2026-09-29T12:00:00.000Z" },
];
