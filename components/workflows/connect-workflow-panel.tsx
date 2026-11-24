"use client";

import { useActionState } from "react";
import { connectWorkflow, type ConnectWorkflowActionState } from "@/app/(delaro)/internal/workflows/actions";

type Option = { id: string; name: string };
type MemberOption = { id: string; name: string };

const initialState: ConnectWorkflowActionState = {
  token: null,
  workflowId: null,
  workflowName: null,
  error: null,
};

export function ConnectWorkflowPanel({
  organization,
  endpoint,
  processes,
  implementations,
  metrics,
  members,
}: {
  organization: { id: string; name: string };
  endpoint: string;
  processes: Option[];
  implementations: Option[];
  metrics: Option[];
  members: MemberOption[];
}) {
  const [state, action, pending] = useActionState(connectWorkflow, initialState);

  return <section className="workflow-connect-panel" id="connect-workflow" aria-labelledby="connect-workflow-heading">
    <div className="workflow-connect-intro">
      <p className="eyebrow">Direct connection</p>
      <h2 id="connect-workflow-heading">Connect an existing workflow</h2>
      <p>Register the workflow under {organization.name}, issue one scoped reporting credential, then send a real execution to verify the connection. No improvement or implementation record is required.</p>
      <ol className="workflow-connect-steps" aria-label="Connection steps">
        <li><span>01</span> Register</li>
        <li><span>02</span> Configure n8n</li>
        <li><span>03</span> Verify execution</li>
      </ol>
    </div>

    <form action={action} className="pilot-form workflow-connect-form">
      <input type="hidden" name="organizationId" value={organization.id}/>
      <label>Client organization<input value={organization.name} readOnly aria-describedby="organization-selection-note"/></label>
      <label>Platform<select name="platform" defaultValue="n8n_cloud" required><option value="n8n_cloud">n8n Cloud</option><option value="n8n_self_hosted">n8n self-hosted</option></select></label>
      <label>Workflow name<input name="workflowName" minLength={2} maxLength={180} required placeholder="Order synchronization"/></label>
      <label>Workflow URL or ID<input name="workflowReference" maxLength={1000} required placeholder="https://workspace.app.n8n.cloud/workflow/…"/></label>
      <details className="workflow-enrichment-fields">
        <summary>Optional operating context</summary>
        <div className="pilot-form">
          <label>Business description<textarea name="purpose" maxLength={2000} placeholder="What this workflow supports and why it matters"/></label>
          <label>Operational process<select name="processId" defaultValue=""><option value="">Link later</option>{processes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Consulting implementation<select name="implementationId" defaultValue=""><option value="">Not required</option>{implementations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Owner<select name="ownerMembershipId" defaultValue=""><option value="">Assign later</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Metric<select name="metricId" defaultValue=""><option value="">Link later</option>{metrics.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </div>
      </details>
      <label className="pilot-check"><input name="publishToClient" type="checkbox" defaultChecked/> Show this workflow in the client workspace</label>
      <p className="form-guidance" id="organization-selection-note">Change the selected organization above this panel before registering a workflow for another client.</p>
      <button type="submit" disabled={pending}>{pending ? "Creating secure connection…" : "Register and generate credential"}</button>
    </form>

    {state.error && <p className="workflow-form-error" role="alert">{state.error}</p>}
    {state.token && state.workflowId && <div className="workflow-setup" role="status">
      <div className="workflow-setup-heading"><div><p className="eyebrow">Credential created</p><h3>Configure {state.workflowName}</h3></div><span className="workflow-connection workflow-connection-disconnected"><i aria-hidden="true"/>Configured · awaiting execution</span></div>
      <p>The credential is shown once. Save it in n8n as a secret header value; Delaro stores only its hash.</p>
      <div className="workflow-token"><strong>Authorization credential</strong><code>Bearer {state.token}</code></div>
      <ol className="workflow-instructions">
        <li><strong>Add an HTTP Request node</strong><span>Place it on the successful completion path. Use <code>POST</code> to <code>{endpoint}</code>.</span></li>
        <li><strong>Add request headers</strong><span><code>Authorization</code>: the Bearer value above. <code>Content-Type</code>: <code>application/json</code>.</span></li>
        <li><strong>Send bounded execution metadata</strong><pre>{`{
  "eventId": "{{$execution.id}}-completed",
  "executionId": "{{$execution.id}}",
  "eventType": "completed",
  "status": "successful",
  "occurredAt": "{{$now.toISO()}}",
  "source": "n8n_workflow_reporter"
}`}</pre></li>
        <li><strong>Run one genuine execution</strong><span>Return here after n8n reports it. The status remains configured until Delaro receives valid authenticated telemetry.</span></li>
      </ol>
      <div className="workflow-template-library" aria-labelledby="workflow-template-heading">
        <div><p className="eyebrow">Reusable n8n setup</p><h4 id="workflow-template-heading">Download reporting templates</h4></div>
        <p>Import the success reporter and copy its HTTP node to the real successful completion path. Import and publish the Error Trigger workflow separately, then select it under the monitored workflow&apos;s settings. Imported credentials are placeholders; choose the Header Auth credential you just created.</p>
        <div className="workflow-template-links">
          <a download href="/integrations/n8n/delaro-success-reporter.json">Success reporter JSON</a>
          <a download href="/integrations/n8n/delaro-error-reporter.json">Error Trigger JSON</a>
          <a download href="/integrations/n8n/delaro-controlled-failure-test.json">Controlled failure test JSON</a>
        </div>
        <p className="form-guidance">Error Trigger runs only for automatic executions. A manual n8n test does not prove failure coverage.</p>
      </div>
      <a className="workflow-verify-link" href={`#workflow-${state.workflowId}`}>Check connection record <span aria-hidden="true">↓</span></a>
    </div>}
  </section>;
}
