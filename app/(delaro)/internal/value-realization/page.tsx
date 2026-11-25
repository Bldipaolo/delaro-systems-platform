import { EvidenceState } from "@/components/analytics/evidence-state";
import { ExecutiveKpiSummary } from "@/components/analytics/executive-kpi-summary";
import { FinancialBreakdownChart } from "@/components/analytics/financial-breakdown-chart";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";
import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { formatCurrency, formatDate, formatPeriod, formatPercentage } from "@/lib/analytics/format";
import { buildVerifiedValueSeries } from "@/lib/analytics/series";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalEconomicImpact } from "@/lib/data/economic-impact";
import { getInitiatives } from "@/lib/data/initiatives";
import { getOpportunities } from "@/lib/data/opportunities";
import { createClient } from "@/lib/supabase/server";
import { addValueCost, addValueInput, approveValueAggregation, createValueModel, linkValueModel, publishValueModel, requestValueValidation, reviewRealization, reviewValueCost, submitRealization, submitValueEvidence } from "./actions";

const categories = ["labor_savings","capacity_creation","revenue_recovery","conversion_improvement",
  "response_time_improvement","error_reduction","avoided_hiring","working_capital_improvement","risk_reduction"];

export default async function ValueRealizationPage() {
  const context = await requireInternalUserContext();
  const [{ models, summary, realizationReviews }, opportunities, initiatives] = await Promise.all([
    getInternalEconomicImpact(), context ? getOpportunities() : Promise.resolve([]),
    context ? getInitiatives() : Promise.resolve([]),
  ]);
  const client = context ? await createClient() : null;
  const [rawModelsResult, metricResult, workflowResult, memberResult] = client ? await Promise.all([
    client.from("value_models").select("id,status,client_visible,aggregation_approved_at").eq("organization_id", context!.organization.id),
    client.from("measurement_metrics").select("id,name,unit").eq("organization_id", context!.organization.id).order("name"),
    client.from("implementation_workflows").select("id,workflow_name").eq("organization_id", context!.organization.id).order("workflow_name"),
    client.from("organization_memberships").select("id,role,status,profiles(full_name,email)").eq("organization_id", context!.organization.id).eq("status", "active").in("role", ["client_admin","client_user"]),
  ]) : [null, null, null, null];
  if (rawModelsResult?.error) throw new Error("Unable to load value review records.");
  const rawModels = new Map((rawModelsResult?.data ?? []).map((item) => [item.id, item]));
  const metrics = metricResult?.data ?? [];
  const workflows = workflowResult?.data ?? [];
  const clientMembers = (memberResult?.data ?? []).map((item) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return { id: item.id, name: profile?.full_name ?? profile?.email ?? String(item.role).replaceAll("_", " ") };
  });
  const verifiedSeries = buildVerifiedValueSeries(models);
  const submittedReviews = realizationReviews.filter((item) => item.verificationStatus === "pending" || item.verificationStatus === "submitted");
  const approvedModels = models.filter((model) => model.valid && model.aggregationApproved);
  const approvedModelIds = new Set(approvedModels.map((model) => model.id));
  const verifiedPeriods = realizationReviews.filter((item) => item.verificationStatus === "verified" && approvedModelIds.has(item.modelId)).length;
  const overlapConflict = approvedModels.some((model) => model.validationMessage?.includes("overlap"));
  const portfolioConflict = summary.hasCurrencyConflict
    ? "approved streams use different currencies"
    : summary.hasBenefitStreamConflict
      ? "approved streams overlap the same benefit"
      : overlapConflict
        ? "verified measurement periods overlap"
        : null;
  const totalWithheldReason = portfolioConflict ?? (verifiedPeriods > 0 && summary.verifiedRealizedValue === null
    ? "not every approved stream has a complete verified period"
    : null);
  const verifiedStatus = summary.verifiedRealizedValue === null ? "pending" as const : "verified" as const;
  const verifiedValue = totalWithheldReason ? "Withheld" : formatCurrency(summary.verifiedRealizedValue, summary.currencyCode);
  const expectedValue = portfolioConflict ? "Withheld" : formatCurrency(summary.expectedAnnualValue, summary.currencyCode);

  return <InternalPage stage="Measure / economic impact" title="Value realization" description="Compare approved expected value with evidence-backed realized periods, then manage models and verification in a separate workbench." demo={!context}>
    <section className="analytics-section internal-analytics-section" aria-labelledby="realization-position-title">
      <div className="analytics-section-heading"><div><h2 id="realization-position-title">Value position</h2><p>Annual models and cumulative realized value remain separate claims with separate evidence requirements.</p></div><span>{approvedModels.length} approved {approvedModels.length === 1 ? "stream" : "streams"}</span></div>
      <ExecutiveKpiSummary items={[
        { id: "verified", label: "Verified realized value", value: verifiedValue, context: totalWithheldReason ? `Portfolio total withheld: ${totalWithheldReason}.` : "Cumulative value from verified, non-overlapping measurement periods.", status: verifiedStatus, stateLabel: totalWithheldReason ? "Withheld" : undefined, emphasis: true },
        { id: "expected", label: "Expected annual value", value: expectedValue, context: portfolioConflict ? `Portfolio total withheld: ${portfolioConflict}.` : "Modeled annual value after recoverability and expected-capture assumptions.", status: "submitted", stateLabel: portfolioConflict ? "Withheld" : "Modeled" },
        { id: "periods", label: "Verified periods", value: String(verifiedPeriods), context: "Reviewed realized-value periods retained in the audit record.", status: verifiedPeriods ? "verified" : "pending" },
        { id: "review", label: "Periods awaiting review", value: String(submittedReviews.length), context: "Submitted periods remain excluded from realized-value totals.", status: submittedReviews.length ? "submitted" : "verified", stateLabel: submittedReviews.length ? "Review queue" : "Clear" },
      ]}/>
      <p className="analytics-method-note"><strong>Time basis:</strong> expected value is annual; verified realized value is cumulative through completed periods. Annualized run rates are not counted as realized value.</p>
      {portfolioConflict && <p className="analytics-caution">Portfolio totals are withheld because {portfolioConflict}. Resolve the model conflict before reporting an executive value.</p>}
    </section>

    <section className="analytics-section internal-analytics-section" aria-labelledby="realization-history-title">
      <div className="analytics-section-heading"><div><h2 id="realization-history-title">Verified realized value over time</h2><p>The cumulative line includes approved, same-currency, non-overlapping streams with verified evidence.</p></div><span>{verifiedSeries.length ? `Through ${formatDate(verifiedSeries.at(-1)?.date ?? null)}` : "No verified periods"}</span></div>
      <div className="analytics-chart-frame">
        <TimeSeriesChart points={verifiedSeries} valueFormatter={(value) => formatCurrency(value, summary.currencyCode, { compact: true })} emptyTitle={totalWithheldReason ? "Portfolio total withheld" : "No verified realized value yet"} emptyCopy={totalWithheldReason ? `A partial line is not shown because ${totalWithheldReason}.` : "Submitted periods stay in the review queue and do not appear in this line until their supporting evidence is verified."}/>
        <aside className="analytics-chart-note"><strong>Review boundary</strong><dl><div><dt>Approved streams</dt><dd>{approvedModels.length}</dd></div><div><dt>Verified periods</dt><dd>{verifiedPeriods}</dd></div><div><dt>Awaiting review</dt><dd>{submittedReviews.length}</dd></div></dl><p>Rejected, incomplete, mixed-currency, or overlapping records are never silently included in the cumulative total.</p></aside>
      </div>
    </section>

    <section className="analytics-section internal-analytics-section" aria-labelledby="realization-breakdown-title">
      <div className="analytics-section-heading"><div><h2 id="realization-breakdown-title">Expected value by improvement</h2><p>The model progression shows theoretical ceiling, recoverable value, and expected annual value before any realized claim.</p></div><span>Annual model</span></div>
      <FinancialBreakdownChart models={models}/>
    </section>

    <DataSection title="Value model audit" empty="No value models documented yet.">{models.map((model) => <DataRow key={model.id} title={model.name} subtitle={model.calculationMethod} values={[
      { label: "Expected annual", value: formatCurrency(model.expectedAnnualValue, model.currencyCode) },
      { label: "Observed economic value", value: formatCurrency(model.observedEconomicValue, model.currencyCode) },
      { label: "Realized value", value: formatCurrency(model.realizedValue, model.currencyCode) },
      { label: "Verified realized", value: formatCurrency(model.verifiedRealizedValue, model.currencyCode) },
      { label: "First-year cost", value: formatCurrency(model.firstYearCost, model.currencyCode) },
      { label: "Modeled ROI", value: model.modeledRoiPercentage === null ? "Unsupported" : formatPercentage(model.modeledRoiPercentage) },
      { label: "Modeled payback", value: model.modeledPaybackMonths === null ? "Unsupported" : `${model.modeledPaybackMonths} months` },
      { label: "Latest verified period", value: model.latestVerifiedPeriod ?? "Evidence pending" },
      { label: "Verified sources", value: model.evidence.filter((item) => item.verificationStatus === "verified").length },
      { label: "Aggregation", value: model.aggregationApproved ? "Approved" : "Pending approval" },
      { label: "Audit", value: model.validationMessage ?? (model.dataQuality === "stale" ? `${model.staleInputCount} stale inputs` : `${model.confidence} confidence`) },
    ]}/>)}</DataSection>

    {context && <section className="internal-workbench" aria-labelledby="value-workbench-title">
      <div className="analytics-section-heading"><div><h2 id="value-workbench-title">Value workbench</h2><p>Create and publish models, document assumptions, submit evidence, and review measured periods.</p></div><span>Internal controls</span></div>
      <details className="workbench-group"><summary>Define a new economic model</summary><form action={createValueModel} className="pilot-form">
        <label>Name<input name="name" minLength={3} required/></label>
        <label>Opportunity<select name="opportunityId" defaultValue=""><option value="">None</option>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Improvement<select name="initiativeId" defaultValue=""><option value="">None</option>{initiatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Workflow<select name="workflowId" defaultValue=""><option value="">None</option>{workflows.map((item) => <option key={item.id} value={item.id}>{item.workflow_name}</option>)}</select></label>
        <label>Value category<select name="category">{categories.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
        <label>Calculation<select name="formulaKind"><option value="product">Product of factors</option><option value="minutes_to_hours_product">Minutes × factors ÷ 60</option><option value="positive_delta_product">Target minus baseline × factors</option><option value="negative_delta_product">Baseline minus target × factors</option></select></label>
        <label>Calculation method<textarea name="calculationMethod" minLength={5} required/></label><label>Annualization basis<input name="annualizationBasis" placeholder="Document period and extrapolation" minLength={3} required/></label>
        <label>Economic mechanism<textarea name="economicMechanism" placeholder="Explain how the measured change affects capacity, cost, revenue, working capital, or risk." minLength={3} required/></label>
        <label>Time horizon<select name="timeHorizon" defaultValue="annual"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label>
        <label>Benefit stream key<input name="benefitStreamKey" pattern="[a-z][a-z0-9_]*" placeholder="e.g. order_processing_labor" required/></label>
        <label>Recoverable %<input name="recoverablePercentage" type="number" min="0" max="100" step="0.01" placeholder="Unknown"/></label><label>Expected capture %<input name="expectedCapturePercentage" type="number" min="0" max="100" step="0.01" placeholder="Unknown"/></label>
        <label>Attribution %<input name="attributionPercentage" type="number" min="0" max="100" step="0.01" placeholder="Leave blank when not applicable"/></label><label>Attribution rationale<textarea name="attributionRationale" placeholder="Required when attribution is applied"/></label>
        <button type="submit">Save draft model</button>
      </form></details>

      <DataSection title={`Manage value streams · ${models.length}`} empty="No value models documented yet.">{models.map((model) => {
        const reviews = realizationReviews.filter((item) => item.modelId === model.id);
        const raw = rawModels.get(model.id);
        const waiting = reviews.filter((item) => item.verificationStatus === "pending" || item.verificationStatus === "submitted");
        return <details className="workbench-record" key={model.id}><summary><span><strong>{model.name}</strong><small>{model.calculationMethod}</small></span><span><EvidenceState status={waiting.length ? "submitted" : model.aggregationApproved ? "verified" : "pending"} label={waiting.length ? `${waiting.length} periods awaiting review` : model.aggregationApproved ? "Aggregation approved" : "Model approval pending"}/></span></summary>
          <div className="pilot-editors">
            <details className="pilot-editor"><summary>Calculation inputs · {model.inputs.length}</summary>
              {model.inputs.map((input) => <p key={input.id}>{input.label}: {Number.isFinite(input.value) ? `${input.value} ${input.unit}` : "Source value pending"} · {input.derivation === "manual" || !input.derivation ? input.origin : input.derivation.replaceAll("_", " ")}{input.stale ? " · stale source" : ""} · {input.sourceDescription}</p>)}
              <form action={addValueInput} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/><label>Input key<input name="inputKey" pattern="[a-z][a-z0-9_]*" required/></label><label>Label<input name="label" minLength={2} required/></label><label>Role<select name="role"><option value="factor">Factor</option><option value="baseline">Baseline</option><option value="target">Target</option></select></label><label>Source method<select name="derivation" defaultValue="manual"><option value="manual">Manual documented value</option><option value="metric_baseline">Verified metric baseline</option><option value="metric_latest_verified">Latest verified metric</option><option value="metric_latest_observed">Latest observed metric</option><option value="metric_improvement_absolute">Verified absolute improvement</option><option value="metric_improvement_percentage">Verified percentage improvement</option></select></label><label>Metric<select name="metricId" defaultValue=""><option value="">Not metric-derived</option>{metrics.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label><label>Manual value<input name="value" type="number" min="0" step="any" placeholder="Required for manual inputs"/></label><label>Unit<input name="unit" required/></label><label>Origin<select name="origin"><option value="known">Known</option><option value="client_assumption">Client assumption</option><option value="delaro_assumption">Delaro assumption</option></select></label><label>Stale after days<input name="staleAfterDays" type="number" min="1" max="3650" placeholder="Optional"/></label><label>Sensitivity low<input name="sensitivityLow" type="number" min="0" step="any" placeholder="Optional"/></label><label>Sensitivity high<input name="sensitivityHigh" type="number" min="0" step="any" placeholder="Optional"/></label><label>Source or assumption basis<textarea name="sourceDescription" minLength={3} required/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Show calculation input to client</label><button type="submit">Save input</button></form>
            </details>
            <details className="pilot-editor"><summary>Linked metrics and workflows</summary><form action={linkValueModel} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/><label>Metric<select name="metricId" defaultValue=""><option value="">None</option>{metrics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Workflow<select name="workflowId" defaultValue=""><option value="">None</option>{workflows.map((item) => <option key={item.id} value={item.id}>{item.workflow_name}</option>)}</select></label><label>Relationship<select name="relationship"><option value="driver">Economic driver</option><option value="volume">Volume</option><option value="quality">Quality</option><option value="attribution">Attribution</option><option value="cost">Cost</option></select></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Publish this relationship with the model</label><button type="submit">Link record</button></form></details>
            <details className="pilot-editor"><summary>Associated costs · {model.costs?.length ?? 0}</summary>{model.costs?.map((cost) => <p key={cost.id}>{cost.label} · {formatCurrency(cost.amount, cost.currencyCode)} · {cost.cadence.replaceAll("_", " ")} · {cost.verificationStatus}</p>)}<form action={addValueCost} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/><label>Cost category<select name="category">{["implementation","software","api","infrastructure","maintenance","delaro_fee","client_labor","other"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label>Label<input name="label" required/></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required/></label><label>Currency<input name="currencyCode" defaultValue={model.currencyCode} pattern="[A-Z]{3}" required/></label><label>Cadence<select name="cadence"><option value="one_time">One time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label><label>Custom annualization factor<input name="annualizationFactor" type="number" min="0" max="366" step="any" placeholder="Custom cadence only"/></label><label>Source or assumption basis<textarea name="sourceDescription" minLength={3} required/></label><label>Evidence<select name="evidenceId" defaultValue=""><option value="">No evidence yet</option>{model.evidence.map((item) => <option key={item.id} value={item.id}>{item.sourceReference}</option>)}</select></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Show this cost to clients</label><button type="submit">Save cost</button></form>{model.costs?.filter((cost) => cost.verificationStatus === "pending" || cost.verificationStatus === "submitted").map((cost) => <form key={cost.id} action={reviewValueCost} className="methodology-inline-form"><input type="hidden" name="id" value={cost.id}/><span>{cost.label} · {formatCurrency(cost.amount, cost.currencyCode)} · {cost.verificationStatus}</span><button name="outcome" value="verified">Verify cost</button><button name="outcome" value="rejected">Reject</button></form>)}</details>
            <details className="pilot-editor"><summary>Client validation · {model.validations?.length ?? 0}</summary>{model.validations?.map((validation) => <p key={validation.id}>{validation.status} · {validation.responseNote ?? validation.requestNote ?? "No note"}</p>)}<form action={requestValueValidation} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/><label>Requested from<select name="requestedFromMembershipId" required><option value="">Choose client reviewer</option>{clientMembers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>What should the client validate?<textarea name="requestNote" minLength={3} required/></label><button type="submit">Request validation</button></form></details>
            {!raw?.aggregation_approved_at && <form action={publishValueModel} className="methodology-inline-form"><input type="hidden" name="modelId" value={model.id}/><label>Publication<select name="visibility" defaultValue={raw?.client_visible && raw.status === "active" ? "published" : "draft"}><option value="draft">Internal draft</option><option value="published">Published model</option></select></label><button type="submit">Save publication</button></form>}
            {raw?.client_visible && raw.status === "active" && !raw.aggregation_approved_at && <form action={approveValueAggregation} className="methodology-inline-form"><input type="hidden" name="modelId" value={model.id}/><label>Type APPROVE to include this documented stream in executive totals<input name="confirmation" pattern="APPROVE" required/></label><button type="submit">Approve aggregation</button></form>}
            {raw?.aggregation_approved_at && <p>Approved for executive aggregation · model inputs are immutable.</p>}
            <details className="pilot-editor"><summary>Source evidence · {model.evidence.length}</summary>{model.evidence.map((item) => <p key={item.id}>{item.sourceReference} · {item.verificationStatus}</p>)}<form action={submitValueEvidence} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/><label>Source type<select name="sourceType">{["system_export","document","sample","client_record","audit","other"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label>Source reference<input name="sourceReference" minLength={3} required/></label><label>Description<textarea name="description"/></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Client may see this source once verified</label><button type="submit">Submit evidence for review</button></form></details>
            <details className="pilot-editor"><summary>Record observed or realized value</summary><form action={submitRealization} className="pilot-form"><input type="hidden" name="modelId" value={model.id}/><label>Economic state<select name="realizationState"><option value="observed">Observed consequence</option><option value="realized">Realized financial outcome</option></select></label><label>Period start<input name="periodStart" type="date" required/></label><label>Period end<input name="periodEnd" type="date" required/></label><label>Economic units<input name="realizedUnits" type="number" step="any" min="0" required/></label><label>Value per unit<input name="unitValue" type="number" step="any" min="0" required/></label><label>Unit label<input name="unitLabel" placeholder="e.g. hours or avoided events" required/></label><label>Source description<textarea name="sourceDescription" minLength={3} required/></label><label>Annualization factor<input name="annualizationFactor" type="number" step="any" min="0" max="366" placeholder="Leave blank if unsupported"/></label><label>Annualization method<input name="annualizationMethod" placeholder="Required only with factor"/></label><label>Evidence<select name="evidenceId" required><option value="">Choose source</option>{model.evidence.map((item) => <option key={item.id} value={item.id}>{item.sourceReference} · {item.verificationStatus}</option>)}</select></label><label className="pilot-check"><input name="clientVisible" type="checkbox"/> Show as observed/realized, not verified</label><button type="submit">Submit economic period for review</button></form></details>
            {waiting.map((item) => <form key={item.id} action={reviewRealization} className="methodology-inline-form"><input type="hidden" name="id" value={item.id}/><span>{formatPeriod(item.periodStart, item.periodEnd)} · {formatCurrency(item.realizedValue, model.currencyCode)} · {item.verificationStatus} · evidence {item.evidenceStatus}</span><button name="outcome" value="verified" type="submit">Verify period</button><button name="outcome" value="rejected" type="submit">Reject</button></form>)}
          </div>
        </details>;
      })}</DataSection>
    </section>}
  </InternalPage>;
}
