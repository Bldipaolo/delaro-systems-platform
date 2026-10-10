import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalMeasurement } from "@/lib/data/internal-measurement";
import { createClient } from "@/lib/supabase/server";
import { reviewMetricResult, saveMetric, saveMetricTarget, submitMetricBaseline, submitMetricEvidence, submitMetricObservation } from "./actions";

export default async function MeasurementPage() {
  const context = await requireInternalUserContext();
  const { metrics } = await getInternalMeasurement();
  const client = context ? await createClient() : null;
  const organizationId = context?.organization.id;
  const [processesResult, initiativesResult, evidenceResult, baselinesResult, observationsResult] = client && organizationId
    ? await Promise.all([
        client.from("processes").select("id,name").eq("organization_id", organizationId),
        client.from("initiatives").select("id,title").eq("organization_id", organizationId),
        client.from("measurement_evidence").select("id,metric_id,source_reference,verification_status,client_visible").eq("organization_id", organizationId),
        client.from("metric_baselines").select("id,metric_id,value,verification_status").eq("organization_id", organizationId),
        client.from("metric_observations").select("id,metric_id,measured_value,verification_status,measured_at").eq("organization_id", organizationId).order("measured_at", { ascending: false }),
      ])
    : [null, null, null, null, null];
  if ([processesResult, initiativesResult, evidenceResult, baselinesResult, observationsResult].some((result) => result?.error))
    throw new Error("Unable to load measurement workflow.");
  const processes = processesResult?.data ?? [];
  const initiatives = initiativesResult?.data ?? [];
  const evidence = evidenceResult?.data ?? [];
  const baselines = baselinesResult?.data ?? [];
  const observations = observationsResult?.data ?? [];
  const value = (amount: number | null, unit: string) => amount === null ? "Pending" : `${amount.toLocaleString("en-US")} ${unit}`;
  return <InternalPage stage="Measure / definitions" title="Metrics" description="Enter baseline, target and actual observations separately. Only reviewed evidence can support a verified result." demo={!context}>
    {context && <DataSection title="New metric"><details className="pilot-editor"><summary>Define a measure</summary><form action={saveMetric} className="pilot-form">
      <label>Name<input name="name" minLength={2} required/></label><label>Description<textarea name="description"/></label>
      <label>Unit<input name="unit" placeholder="minutes, orders, %" required/></label>
      <label>Improvement direction<select name="improvementDirection"><option value="decrease">Decrease</option><option value="increase">Increase</option><option value="target">Target</option></select></label>
      <label>Process<select name="processId" defaultValue=""><option value="">None</option>{processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Improvement<select name="initiativeId" defaultValue=""><option value="">None</option>{initiatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Measurement method<textarea name="measurementMethod"/></label><label>Cadence<input name="cadence" placeholder="e.g. monthly"/></label>
      <label className="pilot-check"><input type="checkbox" name="clientVisible"/> Publish definition to client</label>
      <button type="submit">Save metric</button>
    </form></details></DataSection>}
    <DataSection title={`Defined metrics · ${metrics.length}`} empty="No measures have been defined yet.">{metrics.map((metric) => {
      const sources = evidence.filter((item) => item.metric_id === metric.id);
      const baseline = baselines.find((item) => item.metric_id === metric.id);
      const pending = observations.filter((item) => item.metric_id === metric.id && ["pending","submitted"].includes(item.verification_status));
      return <div key={metric.id}><DataRow title={metric.name} subtitle={metric.method} values={[
        { label: "Baseline", value: value(metric.baseline, metric.unit) }, { label: "Target", value: value(metric.target, metric.unit) },
        { label: "Latest observation", value: value(metric.latestObservation, metric.unit) },
        { label: "Observation state", value: metric.observationStatus }, { label: "Confidence", value: metric.confidence },
        { label: "Recorded at", value: metric.observedAt ? new Date(metric.observedAt).toLocaleDateString("en-US") : "Pending" },
      ]}/>
      {context && <div className="pilot-editors">
        <details className="pilot-editor"><summary>Add source evidence</summary><form action={submitMetricEvidence} className="pilot-form">
          <input type="hidden" name="metricId" value={metric.id}/>
          <label>Source type<select name="sourceType">{["system_export","document","manual_record","audit","other"].map((type) => <option key={type} value={type}>{type.replaceAll("_"," ")}</option>)}</select></label>
          <label>Source reference<input name="sourceReference" minLength={3} required/></label>
          <label>Description<textarea name="description"/></label>
          <label className="pilot-check"><input type="checkbox" name="clientVisible"/> Client may see this source once verified</label>
          <button type="submit">Submit evidence for review</button>
        </form></details>
        <details className="pilot-editor"><summary>Set expected target</summary><form action={saveMetricTarget} className="pilot-form">
          <input type="hidden" name="metricId" value={metric.id}/>
          <label>Target value<input name="value" type="number" step="any" required/></label>
          <label>Target date<input name="targetDate" type="date"/></label>
          <label>Rationale<textarea name="rationale"/></label><button type="submit">Save target</button>
        </form></details>
        {(!baseline || baseline.verification_status === "rejected") && <details className="pilot-editor"><summary>{baseline ? "Revise rejected baseline" : "Submit baseline"}</summary><form action={submitMetricBaseline} className="pilot-form">
          <input type="hidden" name="metricId" value={metric.id}/>
          <label>Baseline value<input name="value" type="number" step="any" required/></label>
          <label>Period start<input name="periodStart" type="date"/></label><label>Period end<input name="periodEnd" type="date"/></label>
          <label>Source description<textarea name="sourceDescription"/></label>
          <label>Evidence<select name="evidenceId" required><option value="">Choose source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.source_reference} · {item.verification_status}</option>)}</select></label>
          <button type="submit">Submit baseline for review</button>
        </form></details>}
        <details className="pilot-editor"><summary>Record actual observation</summary><form action={submitMetricObservation} className="pilot-form">
          <input type="hidden" name="metricId" value={metric.id}/>
          <label>Measured value<input name="value" type="number" step="any" required/></label>
          <label>Period start<input name="periodStart" type="date"/></label><label>Period end<input name="periodEnd" type="date"/></label>
          <label>Source description<textarea name="sourceDescription"/></label>
          <label>Evidence<select name="evidenceId" required><option value="">Choose source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.source_reference} · {item.verification_status}</option>)}</select></label>
          <button type="submit">Submit observation for review</button>
        </form></details>
        {baseline && ["pending","submitted"].includes(baseline.verification_status) && <form action={reviewMetricResult} className="methodology-inline-form"><input type="hidden" name="kind" value="baseline"/><input type="hidden" name="id" value={baseline.id}/><span>Baseline: {baseline.verification_status}</span><button name="outcome" value="verified" type="submit">Verify baseline</button><button name="outcome" value="rejected" type="submit">Reject</button></form>}
        {pending.map((item) => <form key={item.id} action={reviewMetricResult} className="methodology-inline-form"><input type="hidden" name="kind" value="observation"/><input type="hidden" name="id" value={item.id}/><span>Observation {Number(item.measured_value).toLocaleString("en-US")} · {item.verification_status}</span><button name="outcome" value="verified" type="submit">Verify</button><button name="outcome" value="rejected" type="submit">Reject</button></form>)}
      </div>}
      </div>;
    })}</DataSection>
  </InternalPage>;
}
