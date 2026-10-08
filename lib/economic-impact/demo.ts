import type { ValueModel } from "./types";

// The numeric factors below are the illustrative example supplied in the product brief,
// not Northstar data. No recoverable, expected, or verified amount is asserted.
export const demoValueModels: ValueModel[] = [{
  id: "demo-order-capacity", initiativeId: "initiative-quote-order", opportunityId: null, metricId: null,
  name: "Order-handling labor capacity", category: "labor_savings", formulaKind: "product",
  calculationMethod: "Time saved per order × annual order volume × loaded labor cost",
  annualizationBasis: "440 illustrative orders per year",
  currencyCode: "USD", benefitStreamKey: "demo-order-handling", recoverablePercentage: null,
  expectedCapturePercentage: null, confidence: "pending", confidenceRationale: "Illustrative prompt factors only; no client source data or verified evidence.", aggregationApproved: true,
  inputs: [
    { id: "demo-hours", key: "hours_per_order", label: "Hours saved per order", role: "factor", value: 1.82, unit: "hours / order", origin: "delaro_assumption", sourceDescription: "Illustrative prompt example; not measured client data", evidenceId: null },
    { id: "demo-orders", key: "orders_per_year", label: "Annual order volume", role: "factor", value: 440, unit: "orders / year", origin: "delaro_assumption", sourceDescription: "Illustrative prompt example; not measured client data", evidenceId: null },
    { id: "demo-cost", key: "loaded_cost", label: "Loaded labor cost", role: "factor", value: 52, unit: "USD / hour", origin: "delaro_assumption", sourceDescription: "Illustrative prompt example; not measured client data", evidenceId: null },
  ],
  evidence: [], snapshots: [], demo: true,
}];
