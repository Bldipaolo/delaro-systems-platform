import { InternalPage } from "@/components/internal/methodology";
import { ConnectWorkflowPanel } from "@/components/workflows/connect-workflow-panel";
import { WorkflowCredentialPanel } from "@/components/workflows/workflow-credential-panel";
import { WorkflowRealtime } from "@/components/workflows/workflow-realtime";
import { getInternalWorkflowMonitoring } from "@/lib/data/workflow-observability";
import { connectionState, durationLabel, statusLabel } from "@/lib/workflow-observability/types";
import { workflowPlatformLabel } from "@/lib/workflow-observability/registration";
import { revokeWorkflowCredential, updateWorkflowRelationships } from "./actions";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function appOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured?.startsWith("https://") || configured?.startsWith("http://localhost:")) return configured;
  return "https://delaro-systems-platform.vercel.app";
}

export default async function InternalWorkflowsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  const requestedOrganizationId = (await searchParams).organizationId;
  const workspace = await getInternalWorkflowMonitoring(requestedOrganizationId);
  const credentials = workspace.credentials.map((row) => ({ id: String(row.id), workflowId: String(row.workflow_id), label: String(row.label), tokenHint: String(row.token_hint), status: String(row.status), rateLimit: Number(row.rate_limit_per_minute), lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null, createdAt: String(row.created_at) }));
  const endpoint = `${appOrigin()}/api/integrations/n8n/executions`;

  return <InternalPage stage="Deliver / observability" title="Workflow monitoring" description="Connect existing automations directly to a client, manage scoped reporting credentials, and inspect authenticated execution health.">
    <section className="workflow-organization-bar" aria-labelledby="workflow-client-heading">
      <div><p className="eyebrow">Monitoring scope</p><h2 id="workflow-client-heading">Client organization</h2></div>
      <form method="get"><label><span className="sr-only">Select client organization</span><select name="organizationId" defaultValue={workspace.organizationId}>{workspace.organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}</select></label><button type="submit">Open organization</button></form>
      <a href="#connect-workflow">Connect workflow <span aria-hidden="true">↓</span></a>
    </section>

    <ConnectWorkflowPanel organization={{ id: workspace.organizationId, name: workspace.organizationName }} endpoint={endpoint} processes={workspace.processes} implementations={workspace.implementations} metrics={workspace.metrics} members={workspace.members}/>

    <WorkflowCredentialPanel workflows={workspace.workflows.map((workflow) => ({ id: workflow.id, name: workflow.name }))}/>

    <section className="workflow-internal-registry" aria-labelledby="internal-workflow-heading">
      <div className="workflow-section-heading"><div><p className="eyebrow">Registered automation</p><h2 id="internal-workflow-heading">Execution registry</h2></div><span>{workspace.organizationName} · status changes only after authenticated telemetry</span></div>
      <WorkflowRealtime enabled={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}/>
      {workspace.workflows.length ? workspace.workflows.map((workflow) => {
        const credential = credentials.find((item) => item.workflowId === workflow.id && item.status === "active");
        const state = connectionState(workflow.monitoringStatus, workflow.lastReportedAt);
        const successVerified = workflow.executions.some((execution) => execution.status === "successful" && execution.monitoringSource === "n8n_workflow_reporter");
        const failureVerified = workflow.executions.some((execution) => execution.status === "failed" && execution.monitoringSource === "n8n_error_trigger");
        return <article className="workflow-internal-record" id={`workflow-${workflow.id}`} key={workflow.id}>
          <div className="workflow-internal-row">
            <div><span className={`workflow-connection workflow-connection-${state}`}><i aria-hidden="true"/>{state.replaceAll("_", " ")}</span><h3>{workflow.name}</h3><p>{workflow.purpose ?? "Business description not yet added."}</p><small>{workflowPlatformLabel(workflow.platform)} · {workflow.environment} · external ID {workflow.externalWorkflowId} · {workflow.registrationSource === "direct" ? "directly registered" : "implementation linked"}</small></div>
            <dl><div><dt>Latest</dt><dd>{statusLabel(workflow.lastExecutionStatus)}</dd></div><div><dt>Executions</dt><dd>{workflow.executionCount}</dd></div><div><dt>Average</dt><dd>{durationLabel(workflow.averageDurationMs)}</dd></div><div><dt>Credential</dt><dd>{credential ? `Active · ••••${credential.tokenHint}` : "Not configured"}</dd></div></dl>
            {credential && <form action={revokeWorkflowCredential}><input type="hidden" name="credentialId" value={credential.id}/><button className="workflow-revoke" type="submit">Revoke credential</button></form>}
          </div>
          <div className="workflow-coverage" aria-label={`Monitoring coverage for ${workflow.name}`}>
            <div><span>Success reporting</span><strong>{successVerified ? "Verified" : "Awaiting genuine execution"}</strong></div>
            <div><span>Failure reporting</span><strong>{failureVerified ? "Verified" : "Not yet verified"}</strong></div>
            <div><span>Connection health</span><strong>{state === "stale" ? "No recent telemetry" : state === "degraded" ? "Connected · failure reported" : state === "connected" ? "Connected" : state.replaceAll("_", " ")}</strong></div>
            <div className="workflow-coverage-actions"><a download href="/integrations/n8n/delaro-success-reporter.json">Success template</a><a download href="/integrations/n8n/delaro-error-reporter.json">Failure template</a><a download href="/integrations/n8n/delaro-controlled-failure-test.json">Test template</a></div>
          </div>
          <details className="workflow-enrichment-editor"><summary>Operating context and client visibility</summary><form action={updateWorkflowRelationships} className="pilot-form"><input type="hidden" name="workflowId" value={workflow.id}/><input type="hidden" name="organizationId" value={workspace.organizationId}/><label>Business description<textarea name="purpose" maxLength={2000} defaultValue={workflow.purpose ?? ""}/></label><label>Operational process<select name="processId" defaultValue={workflow.processId ?? ""}><option value="">Not linked</option>{workspace.processes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Consulting implementation<select name="implementationId" defaultValue={workflow.implementationId ?? ""}><option value="">Not linked</option>{workspace.implementations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Owner<select name="ownerMembershipId" defaultValue={workflow.ownerMembershipId ?? ""}><option value="">Unassigned</option>{workspace.members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Metric<select name="metricId" defaultValue={workflow.metricId ?? ""}><option value="">Not linked</option>{workspace.metrics.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="pilot-check"><input name="publishToClient" type="checkbox" defaultChecked={workflow.clientVisible}/> Show in client workspace</label><button type="submit">Save context</button></form></details>
        </article>;
      }) : <p className="methodology-empty">No workflows are registered for this client. Use Connect workflow to start monitoring an existing n8n automation.</p>}
    </section>

    <section className="workflow-credential-ledger" aria-labelledby="credential-ledger-heading"><div className="workflow-section-heading"><div><p className="eyebrow">Credential audit</p><h2 id="credential-ledger-heading">Reporter credentials</h2></div><span>Hashes only</span></div>{credentials.length ? credentials.map((credential) => <div className="credential-ledger-row" key={credential.id}><strong>{credential.label}<small>••••{credential.tokenHint}</small></strong><span>{credential.status}</span><span>{credential.lastUsedAt ? `Used ${dateTime.format(new Date(credential.lastUsedAt))}` : "Never used"}</span><span>{credential.rateLimit}/minute</span></div>) : <p className="methodology-empty">No reporter credentials have been created.</p>}</section>
  </InternalPage>;
}
