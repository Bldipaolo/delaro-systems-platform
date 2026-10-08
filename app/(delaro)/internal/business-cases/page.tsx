import { DataRow, DataSection, InternalPage, formatMoney } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalEconomicImpact } from "@/lib/data/economic-impact";
import { getOpportunities } from "@/lib/data/opportunities";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessCasesPage() {
  const context = await requireInternalUserContext();
  const [{ models }, opportunities] = await Promise.all([getInternalEconomicImpact(), getOpportunities()]);
  const client = context ? await createClient() : null;
  const costResult = client ? await client.from("opportunities").select("id,estimated_implementation_cost").eq("organization_id", context!.organization.id) : null;
  if (costResult?.error) throw new Error(`Unable to load implementation costs: ${costResult.error.message}`);
  const costs = new Map((costResult?.data ?? []).map((row) => [row.id, row.estimated_implementation_cost === null ? null : Number(row.estimated_implementation_cost)]));
  return <InternalPage stage="Diagnose / investment case" title="Business cases" description="Trace the opportunity from estimated exposure through addressable value and supporting evidence. Payback remains pending until cost and expected value are documented." demo={!context}>
    <DataSection title={`Value models · ${models.length}`} empty="No value models documented yet.">{models.map((model) => {
      const opportunity = opportunities.find((item) => item.id === model.opportunityId);
      const cost = model.opportunityId ? costs.get(model.opportunityId) ?? null : null;
      const sharedCost = model.opportunityId && models.filter((item) => item.opportunityId === model.opportunityId).length > 1;
      const payback = sharedCost ? "Pending cost allocation" : cost !== null && model.expectedAnnualValue !== null && model.expectedAnnualValue > 0 ? `${(cost / model.expectedAnnualValue * 12).toFixed(1)} months · estimated` : "Pending cost + expected value";
      return <DataRow key={model.id} title={model.name} subtitle={opportunity?.title ?? model.calculationMethod} values={[{ label: "Estimated exposure", value: formatMoney(model.theoreticalMaximum, model.currencyCode) }, { label: "Addressable portion", value: formatMoney(model.realisticallyRecoverable, model.currencyCode) }, { label: "Implementation cost", value: formatMoney(cost, model.currencyCode) }, { label: "Expected annual value", value: formatMoney(model.expectedAnnualValue, model.currencyCode) }, { label: "Payback", value: payback }, { label: "Evidence quality", value: `${model.confidence} · ${model.evidence.filter((item) => item.verificationStatus === "verified").length} verified sources` }]} />;
    })}</DataSection>
    <DataSection title="Opportunities without a value model" empty="All opportunities have a value model.">{opportunities.filter((item) => !models.some((model) => model.opportunityId === item.id)).map((opportunity) => <DataRow key={opportunity.id} title={opportunity.title} subtitle={opportunity.consequence} href="/opportunities" values={[{ label: "Estimated exposure", value: formatMoney(opportunity.estimatedAnnualValue) }, { label: "Evidence quality", value: opportunity.evidenceQuality }, { label: "Business case", value: "Not modeled" }]} />)}</DataSection>
  </InternalPage>;
}
