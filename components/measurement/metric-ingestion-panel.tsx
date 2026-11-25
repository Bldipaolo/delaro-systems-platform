"use client";

import { useActionState } from "react";
import { rotateMetricCredential, type MetricCredentialState } from "@/app/(delaro)/measurement/actions";

const initialState: MetricCredentialState = { token: null, error: null };

export function MetricIngestionPanel({ metricId, metricName, unit, workflows }: { metricId: string; metricName: string; unit: string; workflows: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(rotateMetricCredential, initialState);
  return <details className="pilot-editor"><summary>Connect automated observations</summary>
    <form action={action} className="pilot-form">
      <input type="hidden" name="metricId" value={metricId}/>
      <label>Workflow scope<select name="workflowId" defaultValue=""><option value="">Metric only</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
      <label>Credential label<input name="label" defaultValue={`${metricName} reporter`} required/></label>
      <label>Rate limit per minute<input name="rateLimit" type="number" min="1" max="600" defaultValue="60" required/></label>
      <button type="submit" disabled={pending}>{pending ? "Creating…" : "Rotate reporting credential"}</button>
    </form>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.token && <div className="workflow-token-reveal" role="status"><strong>Copy this token now</strong><code>{state.token}</code><p>It is shown once. Store it in n8n Header Auth as <code>Bearer …</code>. Delaro retains only its SHA-256 digest.</p></div>}
    <ol className="workflow-instructions"><li><span>1</span><p>POST JSON to <code>/api/integrations/n8n/measurements</code>.</p></li><li><span>2</span><p>Send a unique eventId, numeric value, exact unit <code>{unit}</code>, measuredAt, and source <code>n8n_metric_reporter</code>.</p></li><li><span>3</span><p>The result enters as Observed. A Delaro reviewer must verify it before it becomes a verified result.</p></li></ol>
  </details>;
}
