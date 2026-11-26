export type ValueCategory =
  | "labor_savings" | "capacity_creation" | "revenue_recovery"
  | "conversion_improvement" | "response_time_improvement" | "error_reduction"
  | "avoided_hiring" | "working_capital_improvement" | "risk_reduction";
export type FormulaKind = "product" | "positive_delta_product" | "negative_delta_product" | "minutes_to_hours_product";
export type ValueOrigin = "known" | "client_assumption" | "delaro_assumption";
export type VerificationStatus = "pending" | "submitted" | "verified" | "rejected";
export type ValueDerivation = "manual" | "metric_baseline" | "metric_latest_verified" | "metric_latest_observed" | "metric_improvement_absolute" | "metric_improvement_percentage";
export type ValueCostCadence = "one_time" | "monthly" | "quarterly" | "annual" | "custom";

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
  metricId?: string | null;
  derivation?: ValueDerivation;
  measuredAt?: string | null;
  staleAfterDays?: number | null;
  stale?: boolean;
  sourceName?: string | null;
  sourceStatus?: "draft" | "configured" | "healthy" | "stale" | "degraded" | "failed" | "authentication_required" | "disabled" | null;
  sensitivityLow?: number | null;
  sensitivityHigh?: number | null;
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
  verificationStatus?: VerificationStatus;
  realizationState?: "observed" | "realized";
  clientVisible?: boolean;
  sourceDescription?: string | null;
};

export type ValueCost = {
  id: string;
  category: "implementation" | "software" | "api" | "infrastructure" | "maintenance" | "delaro_fee" | "client_labor" | "other";
  label: string;
  amount: number;
  currencyCode: string;
  cadence: ValueCostCadence;
  annualizationFactor: number | null;
  sourceDescription: string;
  evidenceId: string | null;
  verificationStatus: VerificationStatus;
};

export type ValueValidation = {
  id: string;
  status: "pending" | "approved" | "disputed";
  requestNote: string | null;
  responseNote: string | null;
  respondedAt: string | null;
};

export type ValueModel = {
  id: string;
  initiativeId: string | null;
  initiativeName?: string | null;
  opportunityId: string | null;
  workflowId?: string | null;
  metricId: string | null;
  metricIds?: string[];
  workflowIds?: string[];
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
  economicMechanism?: string | null;
  timeHorizon?: "weekly" | "monthly" | "quarterly" | "annual" | "custom";
  attributionPercentage?: number | null;
  attributionRationale?: string | null;
  aggregationApproved: boolean;
  inputs: ValueInput[];
  evidence: ValueEvidence[];
  snapshots: RealizationSnapshot[];
  costs?: ValueCost[];
  validations?: ValueValidation[];
  demo: boolean;
};

export type CalculatedValueModel = ValueModel & {
  valid: boolean;
  validationMessage: string | null;
  theoreticalMaximum: number | null;
  attributedMaximum: number | null;
  realisticallyRecoverable: number | null;
  expectedAnnualValue: number | null;
  observedEconomicValue: number | null;
  realizedValue: number | null;
  verifiedRealizedValue: number | null;
  annualizedCost: number | null;
  firstYearCost: number | null;
  modeledNetFirstYearValue: number | null;
  modeledRoiPercentage: number | null;
  modeledPaybackMonths: number | null;
  dataQuality: "current" | "stale" | "incomplete";
  staleInputCount: number;
  latestVerifiedPeriod: string | null;
  latestAnnualizedRunRate: number | null;
};

export type EconomicSummary = {
  currencyCode: string | null;
  hasCurrencyConflict: boolean;
  hasBenefitStreamConflict: boolean;
  theoreticalMaximum: number | null;
  realisticallyRecoverable: number | null;
  expectedAnnualValue: number | null;
  observedEconomicValue: number | null;
  realizedValue: number | null;
  verifiedRealizedValue: number | null;
  eligibleModelCount: number;
  contributingCounts: { theoretical: number; recoverable: number; expected: number; verified: number };
};
