"use client";

import { useActionState } from "react";
import { rotateWorkflowCredential, type CredentialActionState } from "@/app/(delaro)/internal/workflows/actions";

const initialState: CredentialActionState = { token: null, error: null };

export function WorkflowCredentialPanel({ workflows }: { workflows: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(rotateWorkflowCredential, initialState);
  return <section className="workflow-credential-panel" aria-labelledby="credential-panel-heading">
    <div><p className="eyebrow">Authenticated ingestion</p><h2 id="credential-panel-heading">Create or rotate a reporter credential</h2><p>Rotating immediately revokes the previous token for the selected workflow. The new token is shown once and is never stored in plaintext.</p></div>
    <form action={action} className="pilot-form"><label>Registered workflow<select name="workflowId" required defaultValue=""><option value="" disabled>Select workflow</option>{workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}</select></label><label>Credential label<input name="label" defaultValue="n8n execution reporter" minLength={2} maxLength={120} required/></label><label>Requests per minute<input name="rateLimit" type="number" min="1" max="1000" defaultValue="120" required/></label><button type="submit" disabled={pending || !workflows.length}>{pending ? "Creating…" : "Create / rotate credential"}</button></form>
    {state.error && <p className="workflow-form-error" role="alert">{state.error}</p>}
    {state.token && <div className="workflow-token" role="status"><strong>Copy this token now</strong><p>Store it as an n8n credential. It will not be shown again.</p><code>{state.token}</code></div>}
  </section>;
}
