export type ValueCategory =
  | "labor_savings" | "capacity_creation" | "revenue_recovery"
  | "conversion_improvement" | "response_time_improvement" | "error_reduction"
  | "avoided_hiring" | "working_capital_improvement" | "risk_reduction";
export type FormulaKind = "product" | "positive_delta_product" | "negative_delta_product";
export type ValueOrigin = "known" | "client_assumption" | "delaro_assumption";
export type VerificationStatus = "pending" | "submitted" | "verified" | "rejected";

export type ValueInput = {
  id: string;
  key: string;
  label: string;
  role: "factor" | "baseline" | "target";
  value: number;
  unit: string;
  origin: ValueOrigin;
  sourceDescription: string;
  evidenceId: string | null;
};

export type ValueEvidence = {
  id: string;
  sourceType: string;
  sourceReference: string;
  description: string | null;
  documentUrl: string | null;
  verificationStatus: VerificationStatus;
};

export type RealizationSnapshot = {
  id: string;
  periodStart: string;
  periodEnd: string;
  measuredAt: string;
  realizedUnits: number;
  unitValue: number;
  unitLabel: string;
  realizedValue: number;
  annualizationFactor: number | null;
  annualizedRunRate: number | null;
  annualizationMethod: string | null;
  evidenceId: string;
};

export type ValueModel = {
  id: string;
  initiativeId: string | null;
  opportunityId: string | null;
  metricId: string | null;
  name: string;
  category: ValueCategory;
  formulaKind: FormulaKind;
  calculationMethod: string;
  annualizationBasis: string;
  currencyCode: string;
  benefitStreamKey: string;
  recoverablePercentage: number | null;
  expectedCapturePercentage: number | null;
  confidence: "pending" | "low" | "moderate" | "high";
  confidenceRationale: string | null;
  aggregationApproved: boolean;
  inputs: ValueInput[];
  evidence: ValueEvidence[];
  snapshots: RealizationSnapshot[];
  demo: boolean;
};

export type CalculatedValueModel = ValueModel & {
  valid: boolean;
  validationMessage: string | null;
  theoreticalMaximum: number | null;
  realisticallyRecoverable: number | null;
  expectedAnnualValue: number | null;
  verifiedRealizedValue: number | null;
  latestVerifiedPeriod: string | null;
  latestAnnualizedRunRate: number | null;
};

export type EconomicSummary = {
  currencyCode: string | null;
  theoreticalMaximum: number | null;
  realisticallyRecoverable: number | null;
  expectedAnnualValue: number | null;
  verifiedRealizedValue: number | null;
  eligibleModelCount: number;
  contributingCounts: { theoretical: number; recoverable: number; expected: number; verified: number };
};
