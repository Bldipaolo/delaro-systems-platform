import { DataRow, DataSection, InternalPage, formatMoney } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalEconomicImpact } from "@/lib/data/economic-impact";
import { getInitiatives } from "@/lib/data/initiatives";
import { getOpportunities } from "@/lib/data/opportunities";
import { createClient } from "@/lib/supabase/server";
import { addValueInput, approveValueAggregation, createValueModel, publishValueModel, reviewRealization, submitRealization, submitValueEvidence } from "./actions";

const categories = ["labor_savings","capacity_creation","revenue_recovery","conversion_improvement",
  "response_time_improvement","error_reduction","avoided_hiring","working_capital_improvement","risk_reduction"];

export default async function ValueRealizationPage() {
  const context = await requireInternalUserContext();
  const [{ models, summary }, opportunities, initiatives] = await Promise.all([
    getInternalEconomicImpact(), context ? getOpportunities() : Promise.resolve([]),
    context ? getInitiatives() : Promise.resolve([]),
  ]);
  const client = context ? await createClient() : null;
  const [snapshotsResult, rawModelsResult] = client ? await Promise.all([
    client.from("value_realization_snapshots").select("id,model_id,period_start,period_end,realized_value,verification_status")
      .eq("organization_id", context!.organization.id).order("period_end", { ascending: false }),
    client.from("value_models").select("id,status,client_visible,aggregation_approved_at")
      .eq("organization_id", context!.organization.id),
  ]) : [null,null];
  if (snapshotsResult?.error || rawModelsResult?.error) throw new Error("Unable to load value review records.");
  const snapshots = snapshotsResult?.data ?? [];
  const rawModels = new Map((rawModelsResult?.data ?? []).map((item) => [item.id,item]));
  return <InternalPage stage="Measure / economic impact" title="Value realization" description="Expected annual value and verified realized value are separate claims. Evidence and human review are required before actual value appears." demo={!context}>
    <div className="methodology-summary"><div><span>Expected annual value</span><strong>{formatMoney(summary.expectedAnnualValue, summary.currencyCode ?? "USD")}</strong></div><div><span>Verified realized value</span><strong>{formatMoney(summary.verifiedRealizedValue, summary.currencyCode ?? "USD")}</strong></div><div><span>Approved streams</span><strong>{summary.eligibleModelCount}</strong></div></div>
    {context && <DataSection title="New value model"><details className="pilot-editor"><summary>Define an economic model</summary><form action={createValueModel} className="pilot-form">
      <label>Name<input name="name" minLength={3} required/></label>
      <label>Opportunity<select name="opportunityId" defaultValue=""><option value="">None</option>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Improvement<select name="initiativeId" defaultValue=""><option value="">None</option>{initiatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Value category<select name="category">{categories.map((item) => <option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}</select></label>
      <label>Calculation<select name="formulaKind"><option value="product">Product of factors</option><option value="positive_delta_product">Target minus baseline × factors</option><option value="negative_delta_product">Baseline minus target × factors</option></select></label>
      <label>Calculation method<textarea name="calculationMethod" minLength={5} required/></label>
      <label>Annualization basis<input name="annualizationBasis" placeholder="Document period and extrapolation" minLength={3} required/></label>
      <label>Benefit stream key<input name="benefitStreamKey" pattern="[a-z][a-z0-9_]*" placeholder="e.g. order_processing_labor" required/></label>
      <label>Recoverable %<input name="recoverablePercentage" type="number" min="0" max="100" step="0.01" placeholder="Unknown"/></label>
      <label>Expected capture %<input name="expectedCapturePercentage" type="number" min="0" max="100" step="0.01" placeholder="Unknown"/></label>
      <button type="submit">Save draft model</button>
    </form></details></DataSection>}
    <DataSection title={`Value streams · ${models.length}`} empty="No value models documented yet.">{models.map((model) => {
      const allSnapshots = snapshots.filter((item) => item.model_id === model.id);
      const raw = rawModels.get(model.id);
      return <div key={model.id}><DataRow title={model.name} subtitle={model.calculationMethod} values={[
        { label: "Theoretical", value: formatMoney(model.theoreticalMaximum, model.currencyCode) },
        { label: "Recoverable", value: formatMoney(model.realisticallyRecoverable, model.currencyCode) },
        { label: "Expected", value: formatMoney(model.expectedAnnualValue, model.currencyCode) },
        { label: "Verified", value: formatMoney(model.verifiedRealizedValue, model.currencyCode) },
        { label: "Verified period", value: model.latestVerifiedPeriod ?? "Evidence pending" },
        { label: "Audit", value: model.validationMessage ?? `${model.evidence.filter((item) => item.verificationStatus === "verified").length} verified sources` },
      ]}/>
      {context && <div className="pilot-editors">
        <details className="pilot-editor"><summary>Calculation inputs · {model.inputs.length}</summary>
          {model.inputs.map((input) => <p key={input.id}>{input.label}: {input.value} {input.unit} · {input.origin} · {input.sourceDescription}</p>)}
          <form action={addValueInput} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/>
            <label>Input key<input name="inputKey" pattern="[a-z][a-z0-9_]*" required/></label>
            <label>Label<input name="label" minLength={2} required/></label>
            <label>Role<select name="role"><option value="factor">Factor</option><option value="baseline">Baseline</option><option value="target">Target</option></select></label>
            <label>Value<input name="value" type="number" min="0" step="any" required/></label>
            <label>Unit<input name="unit" required/></label>
            <label>Origin<select name="origin"><option value="known">Known</option><option value="client_assumption">Client assumption</option><option value="delaro_assumption">Delaro assumption</option></select></label>
            <label>Source or assumption basis<textarea name="sourceDescription" minLength={3} required/></label>
            <label className="pilot-check"><input name="clientVisible" type="checkbox"/> Show calculation input to client</label>
            <button type="submit">Save input</button>
          </form>
        </details>
        {!raw?.aggregation_approved_at && <form action={publishValueModel} className="methodology-inline-form"><input type="hidden" name="modelId" value={model.id}/><label>Publication<select name="visibility" defaultValue={raw?.client_visible && raw.status === "active" ? "published" : "draft"}><option value="draft">Internal draft</option><option value="published">Published model</option></select></label><button type="submit">Save publication</button></form>}
        {raw?.client_visible && raw.status === "active" && !raw.aggregation_approved_at && <form action={approveValueAggregation} className="methodology-inline-form"><input type="hidden" name="modelId" value={model.id}/><label>Type APPROVE to include this documented stream in executive totals<input name="confirmation" pattern="APPROVE" required/></label><button type="submit">Approve aggregation</button></form>}
        {raw?.aggregation_approved_at && <p>Approved for executive aggregation · model inputs are immutable.</p>}
        <details className="pilot-editor"><summary>Source evidence · {model.evidence.length}</summary>
          {model.evidence.map((item) => <p key={item.id}>{item.sourceReference} · {item.verificationStatus}</p>)}
          <form action={submitValueEvidence} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/>
            <label>Source type<select name="sourceType">{["system_export","document","sample","client_record","audit","other"].map((item) => <option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}</select></label>
            <label>Source reference<input name="sourceReference" minLength={3} required/></label>
            <label>Description<textarea name="description"/></label>
            <label className="pilot-check"><input name="clientVisible" type="checkbox"/> Client may see this source once verified</label>
            <button type="submit">Submit evidence for review</button>
          </form>
        </details>
        <details className="pilot-editor"><summary>Record realized value</summary><form action={submitRealization} className="pilot-form">
          <input type="hidden" name="modelId" value={model.id}/>
          <label>Period start<input name="periodStart" type="date" required/></label><label>Period end<input name="periodEnd" type="date" required/></label>
          <label>Realized units<input name="realizedUnits" type="number" step="any" min="0" required/></label>
          <label>Value per unit<input name="unitValue" type="number" step="any" min="0" required/></label>
          <label>Unit label<input name="unitLabel" placeholder="e.g. orders" required/></label>
          <label>Annualization factor<input name="annualizationFactor" type="number" step="any" min="0" max="366" placeholder="Leave blank if unsupported"/></label>
          <label>Annualization method<input name="annualizationMethod" placeholder="Required only with factor"/></label>
          <label>Evidence<select name="evidenceId" required><option value="">Choose source</option>{model.evidence.map((item) => <option key={item.id} value={item.id}>{item.sourceReference} · {item.verificationStatus}</option>)}</select></label>
          <button type="submit">Submit measured period for review</button>
        </form></details>
        {allSnapshots.filter((item) => ["pending","submitted"].includes(item.verification_status)).map((item) => <form key={item.id} action={reviewRealization} className="methodology-inline-form">
          <input type="hidden" name="id" value={item.id}/><span>{item.period_start}–{item.period_end} · {formatMoney(Number(item.realized_value))} · {item.verification_status}</span>
          <button name="outcome" value="verified" type="submit">Verify period</button><button name="outcome" value="rejected" type="submit">Reject</button>
        </form>)}
      </div>}
      </div>;
    })}</DataSection>
  </InternalPage>;
}
