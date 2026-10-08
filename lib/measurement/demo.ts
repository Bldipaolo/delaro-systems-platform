import type { ClientImprovement, ImpactMetric } from "./types";

export const demoImpactMetrics: ImpactMetric[] = [
  {
    id: "demo-cycle-time", initiativeId: "initiative-quote-order", name: "Quote-to-order cycle time",
    description: "Elapsed business days from signed customer agreement to planning-ready order.", unit: "days", direction: "decrease",
    baselineValue: 8.4, baselinePeriod: "Q3 2026 · demo estimate", baselineStatus: "pending",
    targetValue: 5.5, targetDate: null, currentValue: null, measurementPeriod: null,
    source: "Commercial handoff log · demo", measurementMethod: "Compare signed agreement and work-order release timestamps",
    cadence: "Monthly", evidenceConfidence: "pending", evidenceDescription: null, evidenceUrl: null,
    lastMeasuredAt: null, ownerName: "Maya Chen", demo: true,
  },
  {
    id: "demo-capacity", initiativeId: "initiative-capacity", name: "Capacity plan confidence",
    description: "Share of committed production slots supported by a reconciled capacity view.", unit: "%", direction: "increase",
    baselineValue: 62, baselinePeriod: "Q3 2026 · demo estimate", baselineStatus: "pending",
    targetValue: 90, targetDate: null, currentValue: null, measurementPeriod: null,
    source: "Planning review · demo", measurementMethod: "Reconcile committed slots with the production schedule",
    cadence: "Monthly", evidenceConfidence: "pending", evidenceDescription: null, evidenceUrl: null,
    lastMeasuredAt: null, ownerName: "Elliot Stone", demo: true,
  },
  {
    id: "demo-rework", initiativeId: null, name: "Rework cost at source",
    description: "Monthly cost of rework captured where defects are identified.", unit: "$ / month", direction: "decrease",
    baselineValue: null, baselinePeriod: null, baselineStatus: "pending",
    targetValue: null, targetDate: null, currentValue: null, measurementPeriod: null,
    source: "Quality and finance records · demo", measurementMethod: "Match defect events with labor and material cost",
    cadence: "Monthly", evidenceConfidence: "pending", evidenceDescription: null, evidenceUrl: null,
    lastMeasuredAt: null, ownerName: "Maya Chen", demo: true,
  },
];

export const demoImprovements: ClientImprovement[] = [
  {
    id: "initiative-quote-order", name: "Quote-to-order handoff", objective: "Reduce delay and ambiguity between commercial approval and production planning.",
    status: "On track", currentPhase: "Design", ownerName: "Maya Chen", nextMilestone: "Validate handoff map · 10 Oct",
    constraintId: "spec-gap", linkedConstraint: "Approved quotes reach planning without a complete specification.",
    currentStateProblem: "Approved orders enter planning with information gaps that require clarification.",
    businessConsequence: "Planning pauses while Sales confirms details, delaying the production slot.",
    rootCause: "Quote and planning records use different required-field checklists.",
    intervention: "Introduce one complete order packet and a shared release check before planning accepts work.",
    implementation: "The team is defining the required fields and validating the handoff with Sales and Planning.",
    linkedProcesses: ["Contracting", "Order handoff", "Scheduling"], linkedSystems: ["Customer CRM", "Production ERP", "Shared order folder"],
    expectedResult: "Shorter quote-to-order cycle time and fewer clarification loops.",
    measurementPlan: "Compare signed-agreement and work-order release timestamps each month, with source records attached before confirming a result.",
    metrics: demoImpactMetrics.filter((metric) => metric.initiativeId === "initiative-quote-order"), demo: true,
  },
  {
    id: "initiative-capacity", name: "Capacity visibility", objective: "Give operations a dependable view of committed and available production capacity.",
    status: "At risk", currentPhase: "Validation", ownerName: "Elliot Stone", nextMilestone: "Confirm source data · 14 Oct",
    constraintId: "capacity-gap", linkedConstraint: "Capacity is reconciled manually before a delivery date can be committed.",
    currentStateProblem: "Planning reconciles capacity across an ERP view and an offline sheet.",
    businessConsequence: "Promised dates are harder to confirm with confidence.",
    rootCause: "Current capacity is spread across the ERP and an offline planning sheet.",
    intervention: "Create a single capacity view grounded in the production schedule.",
    implementation: "Planning is validating source fields and agreeing how available capacity will be calculated.",
    linkedProcesses: ["Scheduling"], linkedSystems: ["Production ERP"],
    expectedResult: "A higher share of delivery commitments backed by a reconciled capacity plan.",
    measurementPlan: "Review a monthly sample of committed slots against the capacity view; verify source exports before reporting change.",
    metrics: demoImpactMetrics.filter((metric) => metric.initiativeId === "initiative-capacity"), demo: true,
  },
];
