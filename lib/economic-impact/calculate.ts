import type { CalculatedValueModel, EconomicSummary, RealizationSnapshot, ValueModel } from "./types";

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
  if (model.formulaKind === "product") {
    return factors.length >= 2 && !baselines.length && !targets.length ? productCents(factors.map((input) => input.value)) : null;
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

function nonOverlapping(snapshots: RealizationSnapshot[]): boolean {
  const ordered = [...snapshots].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return ordered.every((snapshot, index) => index === 0 || ordered[index - 1].periodEnd < snapshot.periodStart);
}

/** Calculate only supported arithmetic. No formula strings are evaluated and no target becomes an actual. */
export function calculateValueModel(model: ValueModel): CalculatedValueModel {
  const base = theoreticalCents(model);
  const valid = Boolean(model.initiativeId || model.opportunityId) && base !== null;
  const recovery = valid ? percent(base, model.recoverablePercentage) : null;
  const expected = percent(recovery, model.expectedCapturePercentage);
  const verifiedEvidenceIds = new Set(model.evidence.filter((evidence) => evidence.verificationStatus === "verified").map((evidence) => evidence.id));
  const verifiedSnapshots = model.snapshots.filter((snapshot) => validSnapshot(snapshot, verifiedEvidenceIds));
  const canTotalSnapshots = nonOverlapping(verifiedSnapshots);
  const verifiedCents = valid && canTotalSnapshots && verifiedSnapshots.length
    ? verifiedSnapshots.reduce((total, snapshot) => total + (productCents([snapshot.realizedUnits, snapshot.unitValue]) ?? BigInt(0)), BigInt(0))
    : null;
  const latest = [...verifiedSnapshots].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  return {
    ...model, valid,
    validationMessage: !valid ? "Calculation inputs are incomplete or inconsistent." : !canTotalSnapshots ? "Verified periods overlap; total withheld pending review." : null,
    theoreticalMaximum: valid ? dollars(base) : null,
    realisticallyRecoverable: dollars(recovery),
    expectedAnnualValue: dollars(expected),
    verifiedRealizedValue: dollars(verifiedCents),
    latestVerifiedPeriod: latest ? `${latest.periodStart} – ${latest.periodEnd}` : null,
    latestAnnualizedRunRate: latest?.annualizedRunRate ?? null,
  };
}

/** Approved, complete, same-currency benefit streams are the only source of executive totals. */
export function summarizeEconomicImpact(models: CalculatedValueModel[]): EconomicSummary {
  const seen = new Set<string>();
  const approved = models.filter((model) => {
    if (!model.valid || !model.aggregationApproved || seen.has(model.benefitStreamKey)) return false;
    seen.add(model.benefitStreamKey);
    return true;
  });
  const currencyCode = approved[0]?.currencyCode ?? null;
  const eligible = approved.filter((model) => model.currencyCode === currencyCode);
  const sum = (field: "theoreticalMaximum" | "realisticallyRecoverable" | "expectedAnnualValue" | "verifiedRealizedValue") => {
    const values = eligible.map((model) => model[field]).filter((value): value is number => value !== null);
    if (!values.length) return null;
    const totalCents = values.reduce((total, value) => total + Math.round(value * 100), 0);
    return Number.isSafeInteger(totalCents) ? totalCents / 100 : null;
  };
  return {
    currencyCode,
    theoreticalMaximum: sum("theoreticalMaximum"),
    realisticallyRecoverable: sum("realisticallyRecoverable"),
    expectedAnnualValue: sum("expectedAnnualValue"),
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
