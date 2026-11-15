import { CostBenefitComparison, type CostBenefitCase } from "@/components/analytics/cost-benefit-comparison";
import { ExecutiveKpiSummary } from "@/components/analytics/executive-kpi-summary";
import { FinancialBreakdownChart } from "@/components/analytics/financial-breakdown-chart";
import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { calculatePaybackMonths } from "@/lib/analytics/business-case";
import { formatCurrency } from "@/lib/analytics/format";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalEconomicImpact } from "@/lib/data/economic-impact";
import { getOpportunities } from "@/lib/data/opportunities";
import { createClient } from "@/lib/supabase/server";

const paybackNotes = {
  supported: "Implementation cost ÷ expected annual value × 12",
  missing_cost: "Implementation cost not documented",
  missing_benefit: "Expected annual value is incomplete",
  shared_cost: "Cost allocation across models is required",
  unapproved_model: "Value model is not approved for aggregation",
  currency_mismatch: "Implementation cost and expected value use different currencies",
} as const;
const implementationCostCurrency = "USD";

export default async function BusinessCasesPage() {
  const context = await requireInternalUserContext();
  const [{ models, summary }, opportunities] = await Promise.all([getInternalEconomicImpact(), getOpportunities()]);
  const client = context ? await createClient() : null;
  const costResult = client ? await client.from("opportunities").select("id,estimated_implementation_cost").eq("organization_id", context!.organization.id) : null;
  if (costResult?.error) throw new Error(`Unable to load implementation costs: ${costResult.error.message}`);
  const costs = new Map((costResult?.data ?? []).map((row) => [row.id, row.estimated_implementation_cost === null ? null : Number(row.estimated_implementation_cost)]));
  const modelCounts = new Map<string, number>();
  for (const model of models) if (model.opportunityId) modelCounts.set(model.opportunityId, (modelCounts.get(model.opportunityId) ?? 0) + 1);

  const comparisons: CostBenefitCase[] = models.map((model) => {
    const cost = model.opportunityId ? costs.get(model.opportunityId) ?? null : null;
    const payback = calculatePaybackMonths({
      implementationCost: cost,
      expectedAnnualValue: model.expectedAnnualValue,
      sharedCost: Boolean(model.opportunityId && (modelCounts.get(model.opportunityId) ?? 0) > 1),
      modelApproved: model.aggregationApproved,
      currenciesMatch: model.currencyCode === implementationCostCurrency,
    });
    return {
      id: model.id, name: model.initiativeName ?? model.name, currencyCode: model.currencyCode, costCurrencyCode: implementationCostCurrency,
      implementationCost: cost, expectedAnnualValue: model.expectedAnnualValue,
      paybackMonths: payback.months, paybackNote: paybackNotes[payback.reason], approved: model.aggregationApproved,
      comparable: model.currencyCode === implementationCostCurrency,
    };
  });
  const supportedPayback = comparisons.filter((item) => item.paybackMonths !== null).length;
  const approvedModelCount = models.filter((model) => model.valid && model.aggregationApproved).length;

  return <InternalPage stage="Diagnose / investment case" title="Business cases" description="Compare financial opportunity, expected value, implementation cost, and evidence quality without treating modeled value as realized impact." demo={!context}>
    <section className="analytics-section internal-analytics-section" aria-labelledby="case-position-title">
      <div className="analytics-section-heading"><div><h2 id="case-position-title">Modeled financial position</h2><p>Only approved, non-overlapping value streams in a common currency contribute to portfolio totals.</p></div><span>{approvedModelCount} approved {approvedModelCount === 1 ? "stream" : "streams"}</span></div>
      <ExecutiveKpiSummary items={[
        { id: "exposure", label: "Estimated exposure", value: formatCurrency(summary.theoreticalMaximum, summary.currencyCode, { maximumFractionDigits: 0 }), context: "Theoretical annual ceiling before recoverability assumptions.", status: "pending", stateLabel: "Estimated" },
        { id: "addressable", label: "Addressable portion", value: formatCurrency(summary.realisticallyRecoverable, summary.currencyCode, { maximumFractionDigits: 0 }), context: "Annual value considered realistically recoverable.", status: "pending", stateLabel: "Estimated" },
        { id: "expected", label: "Expected annual value", value: formatCurrency(summary.expectedAnnualValue, summary.currencyCode, { maximumFractionDigits: 0 }), context: "Recoverable value after the documented expected-capture assumption.", status: "submitted", stateLabel: "Modeled", emphasis: true },
        { id: "payback", label: "Supported payback analyses", value: `${supportedPayback} / ${models.length}`, context: "Shown only where approved expected value and a non-shared implementation cost are documented.", status: supportedPayback ? "submitted" : "pending", stateLabel: supportedPayback ? "Modeled" : "Incomplete" },
      ]}/>
      <p className="analytics-method-note"><strong>Currency control:</strong> the current opportunity-cost field is denominated in USD. Payback is withheld for value models in any other currency.</p>
      {(summary.hasCurrencyConflict || summary.hasBenefitStreamConflict) && <p className="analytics-caution">Portfolio totals are withheld because {summary.hasCurrencyConflict ? "approved models use different currencies" : "approved models contain overlapping benefit streams"}.</p>}
    </section>

    <section className="analytics-section internal-analytics-section" aria-labelledby="opportunity-breakdown-title">
      <div className="analytics-section-heading"><div><h2 id="opportunity-breakdown-title">Financial opportunity breakdown</h2><p>The expected annual value remains nested inside the recoverable estimate and theoretical ceiling.</p></div><span>Annual model</span></div>
      <FinancialBreakdownChart models={models}/>
    </section>

    <section className="analytics-section internal-analytics-section" aria-labelledby="cost-benefit-title">
      <div className="analytics-section-heading"><div><h2 id="cost-benefit-title">Cost and expected benefit</h2><p>Payback is a modeled planning aid. It is never presented as verified realized value.</p></div><span>{supportedPayback} supported</span></div>
      <CostBenefitComparison cases={comparisons}/>
    </section>

    <DataSection title="Model audit" empty="No value models documented yet.">{models.map((model) => {
      const opportunity = opportunities.find((item) => item.id === model.opportunityId);
      const comparison = comparisons.find((item) => item.id === model.id)!;
      return <DataRow key={model.id} title={model.name} subtitle={opportunity?.title ?? model.calculationMethod} values={[
        { label: "Implementation cost", value: formatCurrency(comparison.implementationCost, comparison.costCurrencyCode, { maximumFractionDigits: 0 }) },
        { label: "Expected annual value", value: formatCurrency(model.expectedAnnualValue, model.currencyCode, { maximumFractionDigits: 0 }) },
        { label: "Payback", value: comparison.paybackMonths === null ? comparison.paybackNote : `${comparison.paybackMonths.toFixed(1)} months · modeled` },
        { label: "Evidence quality", value: `${model.confidence} · ${model.evidence.filter((item) => item.verificationStatus === "verified").length} verified sources` },
        { label: "Aggregation", value: model.aggregationApproved ? "Approved" : "Pending approval" },
        { label: "Calculation", value: model.validationMessage ?? model.calculationMethod },
      ]}/>;
    })}</DataSection>
    <DataSection title="Opportunities without a value model" empty="All opportunities have a value model.">{opportunities.filter((item) => !models.some((model) => model.opportunityId === item.id)).map((opportunity) => <DataRow key={opportunity.id} title={opportunity.title} subtitle={opportunity.consequence} href="/opportunities" values={[{ label: "Estimated exposure", value: formatCurrency(opportunity.estimatedAnnualValue, "USD", { maximumFractionDigits: 0 }) }, { label: "Evidence quality", value: opportunity.evidenceQuality }, { label: "Business case", value: "Not modeled" }]}/>)}</DataSection>
  </InternalPage>;
}
