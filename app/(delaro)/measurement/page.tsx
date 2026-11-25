import { EvidenceState } from "@/components/analytics/evidence-state";
import { DataSection, InternalPage } from "@/components/internal/methodology";
import { MeasurementAnalytics } from "@/components/internal/measurement-analytics";
import { formatUnitValue } from "@/lib/analytics/format";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalMeasurement } from "@/lib/data/internal-measurement";
import { createClient } from "@/lib/supabase/server";
import { reviewMetricResult, saveMetric, saveMetricTarget, submitMetricBaseline, submitMetricEvidence, submitMetricObservation } from "./actions";
import { MetricIngestionPanel } from "@/components/measurement/metric-ingestion-panel";

export default async function MeasurementPage() {
  const context = await requireInternalUserContext();
  const { metrics } = await getInternalMeasurement();
  const client = context ? await createClient() : null;
  const organizationId = context?.organization.id;
  const [processesResult, initiativesResult, evidenceResult, baselinesResult, observationsResult, workflowsResult, workflowMetricsResult] = client && organizationId
    ? await Promise.all([
        client.from("processes").select("id,name").eq("organization_id", organizationId),
        client.from("initiatives").select("id,title").eq("organization_id", organizationId),
        client.from("measurement_evidence").select("id,metric_id,source_reference,verification_status,client_visible").eq("organization_id", organizationId),
        client.from("metric_baselines").select("id,metric_id,value,verification_status").eq("organization_id", organizationId),
        client.from("metric_observations").select("id,metric_id,measured_value,verification_status,measured_at").eq("organization_id", organizationId).order("measured_at", { ascending: false }),
        client.from("implementation_workflows").select("id,workflow_name").eq("organization_id", organizationId).neq("operational_status", "retired").order("workflow_name"),
        client.from("workflow_metrics").select("workflow_id,metric_id").eq("organization_id", organizationId),
      ])
    : [null, null, null, null, null, null, null];
  if ([processesResult, initiativesResult, evidenceResult, baselinesResult, observationsResult, workflowsResult, workflowMetricsResult].some((result) => result?.error))
    throw new Error("Unable to load measurement workflow.");
  const processes = processesResult?.data ?? [];
  const initiatives = initiativesResult?.data ?? [];
  const evidence = evidenceResult?.data ?? [];
  const baselines = baselinesResult?.data ?? [];
  const observations = observationsResult?.data ?? [];
  const workflows = workflowsResult?.data ?? [];
  const workflowMetrics = workflowMetricsResult?.data ?? [];

  return <InternalPage stage="Measure / definitions" title="Metrics" description="Analyze verified performance, then enter and review measurement records in the controlled workbench below." demo={!context}>
    <MeasurementAnalytics metrics={metrics}/>

    {context && <section className="internal-workbench" aria-labelledby="measurement-workbench-title">
      <div className="analytics-section-heading"><div><h2 id="measurement-workbench-title">Measurement workbench</h2><p>Definitions, evidence, baselines, observations, and verification actions are kept together without competing with the analytical view.</p></div><span>Internal controls</span></div>
      <details className="workbench-group"><summary>Define a new measure</summary><form action={saveMetric} className="pilot-form">
        <label>Name<input name="name" minLength={2} required/></label><label>Description<textarea name="description"/></label>
        <label>Unit<input name="unit" placeholder="minutes, orders, %" required/></label>
        <label>Metric type<select name="metricType"><option value="duration">Duration</option><option value="percentage">Percentage</option><option value="count">Count</option><option value="currency">Currency</option><option value="rate">Rate</option><option value="ratio">Ratio</option><option value="other">Other</option></select></label>
        <label>Improvement direction<select name="improvementDirection"><option value="decrease">Decrease</option><option value="increase">Increase</option><option value="target">Target</option></select></label>
        <label>Process<select name="processId" defaultValue=""><option value="">None</option>{processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Improvement<select name="initiativeId" defaultValue=""><option value="">None</option>{initiatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Measurement method<textarea name="measurementMethod"/></label><label>Cadence<input name="cadence" placeholder="e.g. monthly"/></label>
        <label className="pilot-check"><input type="checkbox" name="clientVisible"/> Publish definition to client</label>
        <label className="pilot-check"><input type="checkbox" name="autoPublishObservations"/> Publish authenticated observations as observed (not verified)</label>
        <button type="submit">Save metric</button>
      </form></details>

      <DataSection title={`Manage measures · ${metrics.length}`} empty="No measures have been defined yet.">{metrics.map((metric) => {
        const sources = evidence.filter((item) => item.metric_id === metric.id);
        const baseline = baselines.find((item) => item.metric_id === metric.id);
        const pending = observations.filter((item) => item.metric_id === metric.id && ["pending", "submitted"].includes(item.verification_status));
        return <details className="workbench-record" key={metric.id}><summary><span><strong>{metric.name}</strong><small>{metric.measurementMethod ?? "Measurement method not documented"}</small></span><span><EvidenceState status={pending.length ? "submitted" : metric.currentValue === null ? "pending" : "verified"} label={pending.length ? `${pending.length} awaiting review` : metric.currentValue === null ? "No verified actual" : formatUnitValue(metric.currentValue, metric.unit)}/></span></summary>
          <div className="pilot-editors">
            <details className="pilot-editor"><summary>Add source evidence</summary><form action={submitMetricEvidence} className="pilot-form">
              <input type="hidden" name="metricId" value={metric.id}/>
              <label>Source type<select name="sourceType">{["system_export","document","manual_record","audit","other"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
              <label>Source reference<input name="sourceReference" minLength={3} required/></label><label>Description<textarea name="description"/></label>
              <label className="pilot-check"><input type="checkbox" name="clientVisible"/> Client may see this source once verified</label><button type="submit">Submit evidence for review</button>
            </form></details>
            <details className="pilot-editor"><summary>Set expected target</summary><form action={saveMetricTarget} className="pilot-form">
              <input type="hidden" name="metricId" value={metric.id}/><label>Target value<input name="value" type="number" step="any" required/></label>
              <label>Target date<input name="targetDate" type="date"/></label><label>Rationale<textarea name="rationale"/></label><button type="submit">Save target</button>
            </form></details>
            {(!baseline || baseline.verification_status === "rejected") && <details className="pilot-editor"><summary>{baseline ? "Revise rejected baseline" : "Submit baseline"}</summary><form action={submitMetricBaseline} className="pilot-form">
              <input type="hidden" name="metricId" value={metric.id}/><label>Baseline value<input name="value" type="number" step="any" required/></label>
              <label>Period start<input name="periodStart" type="date"/></label><label>Period end<input name="periodEnd" type="date"/></label><label>Source description<textarea name="sourceDescription"/></label>
              <label>Evidence<select name="evidenceId" required><option value="">Choose source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.source_reference} · {item.verification_status}</option>)}</select></label><button type="submit">Submit baseline for review</button>
            </form></details>}
            <details className="pilot-editor"><summary>Record actual observation</summary><form action={submitMetricObservation} className="pilot-form">
              <input type="hidden" name="metricId" value={metric.id}/><label>Measured value<input name="value" type="number" step="any" required/></label>
              <label>Period start<input name="periodStart" type="date"/></label><label>Period end<input name="periodEnd" type="date"/></label><label>Source description<textarea name="sourceDescription"/></label>
              <label>Evidence<select name="evidenceId" required><option value="">Choose source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.source_reference} · {item.verification_status}</option>)}</select></label><button type="submit">Submit observation for review</button>
            </form></details>
            <MetricIngestionPanel metricId={metric.id} metricName={metric.name} unit={metric.unit} workflows={workflows.filter((workflow) => workflowMetrics.some((link) => link.metric_id === metric.id && link.workflow_id === workflow.id)).map((workflow) => ({ id: workflow.id, name: workflow.workflow_name }))}/>
            {baseline && ["pending", "submitted"].includes(baseline.verification_status) && <form action={reviewMetricResult} className="methodology-inline-form"><input type="hidden" name="kind" value="baseline"/><input type="hidden" name="id" value={baseline.id}/><span>Baseline {Number(baseline.value).toLocaleString("en-US")} · {baseline.verification_status}</span><button name="outcome" value="verified" type="submit">Verify baseline</button><button name="outcome" value="rejected" type="submit">Reject</button></form>}
            {pending.map((item) => <form key={item.id} action={reviewMetricResult} className="methodology-inline-form"><input type="hidden" name="kind" value="observation"/><input type="hidden" name="id" value={item.id}/><span>Observation {Number(item.measured_value).toLocaleString("en-US")} · {item.verification_status}</span><button name="outcome" value="verified" type="submit">Verify</button><button name="outcome" value="rejected" type="submit">Reject</button></form>)}
          </div>
        </details>;
      })}</DataSection>
    </section>}
  </InternalPage>;
}
