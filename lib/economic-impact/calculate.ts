import type { CalculatedValueModel, EconomicSummary, RealizationSnapshot, ValueCost, ValueModel } from "./types";

const scale = BigInt(1_000_000);
const maxSafeCents = BigInt(Number.MAX_SAFE_INTEGER);

function scaled(value: number): bigint | null {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) return null;
  const fixed = value.toFixed(6);
  const [whole, fraction] = fixed.split(".");
  return BigInt(whole) * scale + BigInt(fraction);
}

function productCents(values: number[]): bigint | null {
  if (!values.length || values.length > 8) return null;
  let product = BigInt(1);
  for (const value of values) {
    const part = scaled(value);
    if (part === null) return null;
    product *= part;
  }
  const denominator = scale ** BigInt(values.length);
  const cents = (product * BigInt(100) + denominator / BigInt(2)) / denominator;
  return cents <= maxSafeCents ? cents : null;
}

function dollars(cents: bigint | null): number | null {
  return cents === null || cents > maxSafeCents ? null : Number(cents) / 100;
}

function percent(cents: bigint | null, percentage: number | null): bigint | null {
  if (cents === null || percentage === null || percentage < 0 || percentage > 100) return null;
  const part = scaled(percentage);
  if (part === null) return null;
  return (cents * part + BigInt(50) * scale) / (BigInt(100) * scale);
}

function theoreticalCents(model: ValueModel): bigint | null {
  if (!model.inputs.every((input) => input.label.trim() && input.unit.trim() && input.sourceDescription.trim())) return null;
  const factors = model.inputs.filter((input) => input.role === "factor");
  const baselines = model.inputs.filter((input) => input.role === "baseline");
  const targets = model.inputs.filter((input) => input.role === "target");
  if (model.formulaKind === "product" || model.formulaKind === "minutes_to_hours_product") {
    const product = factors.length >= 2 && !baselines.length && !targets.length ? productCents(factors.map((input) => input.value)) : null;
    return model.formulaKind === "minutes_to_hours_product" && product !== null ? (product + BigInt(30)) / BigInt(60) : product;
  }
  if (baselines.length !== 1 || targets.length !== 1 || factors.length < 1) return null;
  const difference = model.formulaKind === "positive_delta_product"
    ? targets[0].value - baselines[0].value
    : baselines[0].value - targets[0].value;
  if (difference < 0) return null;
  return productCents([difference, ...factors.map((input) => input.value)]);
}

function validSnapshot(snapshot: RealizationSnapshot, evidenceIds: Set<string>): boolean {
  if (!evidenceIds.has(snapshot.evidenceId) || snapshot.periodEnd < snapshot.periodStart) return false;
  const computed = productCents([snapshot.realizedUnits, snapshot.unitValue]);
  return computed !== null && dollars(computed) === snapshot.realizedValue;
}

function validRecordedSnapshot(snapshot: RealizationSnapshot): boolean {
  if (snapshot.periodEnd < snapshot.periodStart || snapshot.verificationStatus === "rejected") return false;
  const computed = productCents([snapshot.realizedUnits, snapshot.unitValue]);
  return computed !== null && dollars(computed) === snapshot.realizedValue;
}

function nonOverlapping(snapshots: RealizationSnapshot[]): boolean {
  const ordered = [...snapshots].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return ordered.every((snapshot, index) => index === 0 || ordered[index - 1].periodEnd < snapshot.periodStart);
}

/** Calculate only supported arithmetic. No formula strings are evaluated and no target becomes an actual. */
export function calculateValueModel(model: ValueModel): CalculatedValueModel {
  const base = theoreticalCents(model);
  const valid = Boolean(model.initiativeId || model.opportunityId || model.workflowId) && base !== null;
  const attributed = valid ? percent(base, model.attributionPercentage ?? 100) : null;
  const recovery = valid ? percent(attributed, model.recoverablePercentage) : null;
  const expected = percent(recovery, model.expectedCapturePercentage);
  const verifiedEvidenceIds = new Set(model.evidence.filter((evidence) => evidence.verificationStatus === "verified").map((evidence) => evidence.id));
  const verifiedSnapshots = model.snapshots.filter((snapshot) => (snapshot.verificationStatus ?? "verified") === "verified" && validSnapshot(snapshot, verifiedEvidenceIds));
  const canTotalSnapshots = nonOverlapping(verifiedSnapshots);
  const verifiedCents = valid && canTotalSnapshots && verifiedSnapshots.length
    ? verifiedSnapshots.reduce((total, snapshot) => total + (productCents([snapshot.realizedUnits, snapshot.unitValue]) ?? BigInt(0)), BigInt(0))
    : null;
  const latest = [...verifiedSnapshots].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  const observedSnapshots = model.snapshots.filter((snapshot) => (snapshot.realizationState ?? "realized") === "observed" && validRecordedSnapshot(snapshot));
  const realizedSnapshots = model.snapshots.filter((snapshot) => (snapshot.realizationState ?? "realized") === "realized" && validRecordedSnapshot(snapshot));
  const observedCents = observedSnapshots.length && nonOverlapping(observedSnapshots)
    ? observedSnapshots.reduce((total, snapshot) => total + Math.round(snapshot.realizedValue * 100), 0) : null;
  const realizedCents = realizedSnapshots.length && nonOverlapping(realizedSnapshots)
    ? realizedSnapshots.reduce((total, snapshot) => total + Math.round(snapshot.realizedValue * 100), 0) : null;
  const costs = model.costs ?? [];
  const modelCosts = costs.filter((cost) => cost.verificationStatus !== "rejected" && cost.currencyCode === model.currencyCode);
  const annualizedCost = modelCosts.length ? annualCost(modelCosts) : null;
  const oneTimeCost = modelCosts.length
    ? sumMoney(modelCosts.filter((cost) => cost.cadence === "one_time").map((cost) => cost.amount))
    : null;
  const firstYearCost = annualizedCost === null || oneTimeCost === null ? null : annualizedCost + oneTimeCost;
  const expectedValue = dollars(expected);
  const modeledNet = expectedValue === null || firstYearCost === null ? null : expectedValue - firstYearCost;
  const roi = modeledNet === null || firstYearCost === null || firstYearCost <= 0 ? null : round((modeledNet / firstYearCost) * 100, 1);
  const monthlyNetBenefit = expectedValue === null || annualizedCost === null ? null : expectedValue / 12 - annualizedCost / 12;
  const payback = oneTimeCost === null || oneTimeCost <= 0 || monthlyNetBenefit === null || monthlyNetBenefit <= 0
    ? null
    : round(oneTimeCost / monthlyNetBenefit, 1);
  const staleInputCount = model.inputs.filter((input) => input.stale).length;
  return {
    ...model, valid,
    validationMessage: !valid ? "Calculation inputs are incomplete or inconsistent." : !canTotalSnapshots ? "Verified periods overlap; total withheld pending review." : null,
    theoreticalMaximum: valid ? dollars(base) : null,
    attributedMaximum: dollars(attributed),
    realisticallyRecoverable: dollars(recovery),
    expectedAnnualValue: dollars(expected),
    observedEconomicValue: observedCents === null ? null : observedCents / 100,
    realizedValue: realizedCents === null ? null : realizedCents / 100,
    verifiedRealizedValue: dollars(verifiedCents),
    annualizedCost, firstYearCost, modeledNetFirstYearValue: modeledNet,
    modeledRoiPercentage: roi, modeledPaybackMonths: payback,
    dataQuality: !valid ? "incomplete" : staleInputCount ? "stale" : "current",
    staleInputCount,
    latestVerifiedPeriod: latest ? `${latest.periodStart} – ${latest.periodEnd}` : null,
    latestAnnualizedRunRate: latest?.annualizedRunRate ?? null,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sumMoney(values: number[]): number | null {
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) return null;
  const cents = values.reduce((total, value) => total + Math.round(value * 100), 0);
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

function annualCost(costs: ValueCost[]): number | null {
  const values = costs.filter((cost) => cost.cadence !== "one_time").map((cost) => {
    const factor = cost.cadence === "monthly" ? 12 : cost.cadence === "quarterly" ? 4 : cost.cadence === "annual" ? 1 : cost.annualizationFactor;
    return factor === null ? Number.NaN : cost.amount * factor;
  });
  return sumMoney(values);
}

/** Shared selection rule for every executive total and time series. */
export function selectEconomicModelsForAggregation(models: CalculatedValueModel[]): CalculatedValueModel[] {
  const approved = models.filter((model) => model.valid && model.aggregationApproved);
  const streamCounts = new Map<string, number>();
  for (const model of approved) streamCounts.set(model.benefitStreamKey, (streamCounts.get(model.benefitStreamKey) ?? 0) + 1);
  if ([...streamCounts.values()].some((count) => count > 1)) return [];
  const currencies = new Set(approved.map((model) => model.currencyCode));
  return currencies.size === 1 ? approved : [];
}

/** Approved, complete, same-currency benefit streams are the only source of executive totals. */
export function summarizeEconomicImpact(models: CalculatedValueModel[]): EconomicSummary {
  const eligible = selectEconomicModelsForAggregation(models);
  const currencyCode = eligible[0]?.currencyCode ?? null;
  const approvedCurrencies = new Set(models.filter((model) => model.valid && model.aggregationApproved).map((model) => model.currencyCode));
  const hasCurrencyConflict = approvedCurrencies.size > 1;
  const approvedStreams = models.filter((model) => model.valid && model.aggregationApproved).map((model) => model.benefitStreamKey);
  const hasBenefitStreamConflict = new Set(approvedStreams).size !== approvedStreams.length;
  const sum = (field: "theoreticalMaximum" | "realisticallyRecoverable" | "expectedAnnualValue" | "observedEconomicValue" | "realizedValue" | "verifiedRealizedValue") => {
    const values = eligible.map((model) => model[field]).filter((value): value is number => value !== null);
    if (!values.length || values.length !== eligible.length) return null;
    const totalCents = values.reduce((total, value) => total + Math.round(value * 100), 0);
    return Number.isSafeInteger(totalCents) ? totalCents / 100 : null;
  };
  return {
    currencyCode, hasCurrencyConflict, hasBenefitStreamConflict,
    theoreticalMaximum: sum("theoreticalMaximum"),
    realisticallyRecoverable: sum("realisticallyRecoverable"),
    expectedAnnualValue: sum("expectedAnnualValue"),
    observedEconomicValue: sum("observedEconomicValue"),
    realizedValue: sum("realizedValue"),
    verifiedRealizedValue: sum("verifiedRealizedValue"),
    eligibleModelCount: eligible.length,
    contributingCounts: {
      theoretical: eligible.filter((model) => model.theoreticalMaximum !== null).length,
      recoverable: eligible.filter((model) => model.realisticallyRecoverable !== null).length,
      expected: eligible.filter((model) => model.expectedAnnualValue !== null).length,
      verified: eligible.filter((model) => model.verifiedRealizedValue !== null).length,
    },
  };
}
