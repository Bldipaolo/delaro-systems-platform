import { DataRow, DataSection, InternalPage, formatMoney } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalEconomicImpact } from "@/lib/data/economic-impact";

export default async function ValueRealizationPage() {
  const context = await requireInternalUserContext();
  const { models, summary } = await getInternalEconomicImpact();
  return <InternalPage stage="Measure / economic impact" title="Value realization" description="Expected annual value and verified realized value are separate claims. Only evidence-backed, non-overlapping periods contribute to verified totals." demo={!context}>
    <div className="methodology-summary"><div><span>Expected annual value</span><strong>{formatMoney(summary.expectedAnnualValue, summary.currencyCode ?? "USD")}</strong></div><div><span>Verified realized value</span><strong>{formatMoney(summary.verifiedRealizedValue, summary.currencyCode ?? "USD")}</strong></div><div><span>Approved streams</span><strong>{summary.eligibleModelCount}</strong></div></div>
    <DataSection title={`Value streams · ${models.length}`} empty="No value models documented yet.">{models.map((model) => <DataRow key={model.id} title={model.name} subtitle={model.calculationMethod} values={[{ label: "Theoretical", value: formatMoney(model.theoreticalMaximum, model.currencyCode) }, { label: "Recoverable", value: formatMoney(model.realisticallyRecoverable, model.currencyCode) }, { label: "Expected", value: formatMoney(model.expectedAnnualValue, model.currencyCode) }, { label: "Verified", value: formatMoney(model.verifiedRealizedValue, model.currencyCode) }, { label: "Verified period", value: model.latestVerifiedPeriod ?? "Evidence pending" }, { label: "Audit", value: model.validationMessage ?? `${model.evidence.filter((item) => item.verificationStatus === "verified").length} verified sources` }]} />)}</DataSection>
  </InternalPage>;
}
