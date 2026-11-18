import type { ClientImplementation } from "./types";

export const demoImplementations: Record<string, ClientImplementation[]> = {
  "initiative-capacity": [{
    id: "implementation-capacity-sync",
    name: "Production schedule synchronization",
    type: "n8n_automation",
    solutionSummary: "A client-owned n8n workflow will reconcile approved production schedules with the capacity view used by operations.",
    progressSummary: "Architecture is documented. Source-system ownership is awaiting client confirmation before development begins.",
    desiredOutcome: "Give operations one dependable view of production capacity without manual schedule reconciliation.",
    status: "architecture",
    ownerName: "Maya Chen",
    plannedDeploymentDate: "2026-11-28",
    actualDeploymentDate: null,
    monitoringStatus: "not_connected",
    monitoringLabel: "Monitoring not connected",
    operationalHealth: "unknown",
    lastObservedStatus: null,
    lastObservedAt: null,
    expectedOperatingCadence: "Every 15 minutes during operating hours",
    supportResponsibility: "Client owns the n8n instance and credentials; Delaro supports workflow logic during the pilot.",
    milestones: [
      { id: "milestone-architecture", title: "Architecture review", description: "Confirm source and destination records.", status: "Complete", dueDate: "2026-11-12", completedDate: "2026-11-11", ownerName: "Maya Chen", clientVisible: true },
      { id: "milestone-credentials", title: "Client configures credentials", description: "Credentials remain in the client-owned n8n instance.", status: "In progress", dueDate: "2026-11-19", completedDate: null, ownerName: "Jordan Davis", clientVisible: true },
    ],
    references: [],
  }],
};
