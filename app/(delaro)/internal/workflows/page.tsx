import { InternalPage } from "@/components/internal/methodology";
import { WorkflowCredentialPanel } from "@/components/workflows/workflow-credential-panel";
import { getInternalWorkflowMonitoring } from "@/lib/data/workflow-observability";
import { connectionState, durationLabel, statusLabel } from "@/lib/workflow-observability/types";
import { revokeWorkflowCredential } from "./actions";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function InternalWorkflowsPage() {
  const workspace = await getInternalWorkflowMonitoring();
  const credentials = workspace.credentials.map((row) => ({ id: String(row.id), workflowId: String(row.workflow_id), label: String(row.label), tokenHint: String(row.token_hint), status: String(row.status), rateLimit: Number(row.rate_limit_per_minute), lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null, createdAt: String(row.created_at) }));
  return <InternalPage stage="Deliver / observability" title="Workflow monitoring" description="Manage authenticated reporting and inspect execution health without storing client n8n access credentials.">
    <WorkflowCredentialPanel workflows={workspace.workflows.map((workflow) => ({ id: workflow.id, name: workflow.name }))}/>
    <section className="workflow-internal-registry" aria-labelledby="internal-workflow-heading"><div className="workflow-section-heading"><div><p className="eyebrow">Registered automation</p><h2 id="internal-workflow-heading">Execution registry</h2></div><span>{workspace.organizationName}</span></div>
      {workspace.workflows.length ? workspace.workflows.map((workflow) => { const credential = credentials.find((item) => item.workflowId === workflow.id && item.status === "active"); return <article className="workflow-internal-row" key={workflow.id}><div><span className={`workflow-connection workflow-connection-${connectionState(workflow.monitoringStatus, workflow.lastReportedAt)}`}><i aria-hidden="true"/>{connectionState(workflow.monitoringStatus, workflow.lastReportedAt).replaceAll("_", " ")}</span><h3>{workflow.name}</h3><p>{workflow.purpose}</p><small>{workflow.platform} · {workflow.environment} · external ID {workflow.externalWorkflowId}</small></div><dl><div><dt>Latest</dt><dd>{statusLabel(workflow.lastExecutionStatus)}</dd></div><div><dt>Executions</dt><dd>{workflow.executionCount}</dd></div><div><dt>Average</dt><dd>{durationLabel(workflow.averageDurationMs)}</dd></div><div><dt>Credential</dt><dd>{credential ? `Active · ••••${credential.tokenHint}` : "Not configured"}</dd></div></dl>{credential && <form action={revokeWorkflowCredential}><input type="hidden" name="credentialId" value={credential.id}/><button className="workflow-revoke" type="submit">Revoke credential</button></form>}</article>; }) : <p className="methodology-empty">Register a workflow under an implementation before connecting n8n monitoring.</p>}
    </section>
    <section className="workflow-credential-ledger" aria-labelledby="credential-ledger-heading"><div className="workflow-section-heading"><div><p className="eyebrow">Credential audit</p><h2 id="credential-ledger-heading">Reporter credentials</h2></div><span>Hashes only</span></div>{credentials.length ? credentials.map((credential) => <div className="credential-ledger-row" key={credential.id}><strong>{credential.label}<small>••••{credential.tokenHint}</small></strong><span>{credential.status}</span><span>{credential.lastUsedAt ? `Used ${dateTime.format(new Date(credential.lastUsedAt))}` : "Never used"}</span><span>{credential.rateLimit}/minute</span></div>) : <p className="methodology-empty">No reporter credentials have been created.</p>}</section>
  </InternalPage>;
}
