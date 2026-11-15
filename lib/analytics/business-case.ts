export type PaybackResult = {
  months: number | null;
  reason: "supported" | "missing_cost" | "missing_benefit" | "shared_cost" | "unapproved_model" | "currency_mismatch";
};

/** Payback is a modeled comparison, never a realized result. Unsupported inputs return an explicit reason. */
export function calculatePaybackMonths({
  implementationCost,
  expectedAnnualValue,
  sharedCost = false,
  modelApproved = true,
  currenciesMatch = true,
}: {
  implementationCost: number | null;
  expectedAnnualValue: number | null;
  sharedCost?: boolean;
  modelApproved?: boolean;
  currenciesMatch?: boolean;
}): PaybackResult {
  if (sharedCost) return { months: null, reason: "shared_cost" };
  if (!modelApproved) return { months: null, reason: "unapproved_model" };
  if (!currenciesMatch) return { months: null, reason: "currency_mismatch" };
  if (implementationCost === null || !Number.isFinite(implementationCost) || implementationCost < 0) return { months: null, reason: "missing_cost" };
  if (expectedAnnualValue === null || !Number.isFinite(expectedAnnualValue) || expectedAnnualValue <= 0) return { months: null, reason: "missing_benefit" };
  return { months: Math.round((implementationCost / expectedAnnualValue) * 120) / 10, reason: "supported" };
}
