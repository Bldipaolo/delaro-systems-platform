# n8n execution observability

Stage 3A accepts small, authenticated outcome events from explicitly registered n8n workflows. It does not connect to the n8n API, store n8n login credentials, or retain workflow inputs and outputs.

## Security model

- A Delaro internal user registers the n8n workflow under an approved implementation.
- `/internal/workflows` creates a workflow-scoped reporter token. Only its SHA-256 hash is stored; the plaintext token is shown once.
- The token resolves the organization and workflow on the server. The request body has no organization or workflow identifier to trust.
- Rotation creates a new token and revokes the prior token in one database transaction. Revocation is immediate.
- Events are limited to 32 KB and a configurable per-credential request limit. Unknown JSON fields are rejected.
- Only identifiers, timing, status, source, and a sanitized error code/summary are retained. Never send customer records, credentials, node inputs, node outputs, stack traces, or complete n8n execution payloads.

## Connect the first workflow

1. In Delaro, register the workflow under **Internal workspace → Implementations → Workflows and integrations**. Use the real n8n workflow ID and a non-secret instance label.
2. Open **Internal workspace → Workflow monitoring** and create the reporter credential. Copy the token immediately.
3. In the client-owned n8n instance, create a reusable **Header Auth** credential:
   - Name: `Delaro execution reporter`
   - Header: `Authorization`
   - Value: `Bearer <one-time Delaro token>`
4. Add an **HTTP Request** node as the final node of a dedicated test workflow:
   - Method: `POST`
   - URL: `https://delaro-systems-platform.vercel.app/api/integrations/n8n/executions`
   - Authentication: the Header Auth credential above
   - Content type: JSON
   - Body:

```json
{
  "eventId": "{{$execution.id}}-completed",
  "executionId": "{{$execution.id}}",
  "eventType": "completed",
  "status": "successful",
  "occurredAt": "{{$now.toISO()}}",
  "source": "n8n_workflow_reporter"
}
```

5. Run the workflow once and confirm a `202` response. Replaying the same `eventId` returns `200` with `duplicate: true` and does not add another event.
6. Confirm the execution appears in the correct client’s **Workflows** page. A successful HTTP response proves event receipt, not the business outcome of the workflow.

## Capture failures

A final reporting node cannot run after an earlier node fails. Create a separate published n8n error workflow whose first node is **Error Trigger**, and select it as the **Error Workflow** in the monitored workflow’s settings.

After Error Trigger, add an **Edit Fields / Set** node that keeps only:

- `eventId`: the failed execution ID plus `-failed`
- `executionId`: the failed execution ID
- `occurredAt`: current ISO timestamp
- `errorCode`: a stable, non-sensitive classification when available
- `errorSummary`: a reviewed plain-language message, truncated to 500 characters

Then send:

```json
{
  "eventId": "{{$json.eventId}}",
  "executionId": "{{$json.executionId}}",
  "eventType": "failed",
  "status": "failed",
  "occurredAt": "{{$json.occurredAt}}",
  "errorCode": "{{$json.errorCode}}",
  "errorSummary": "{{$json.errorSummary}}",
  "source": "n8n_error_trigger"
}
```

Use the same workflow-scoped Delaro credential only for the registered workflow. If one shared error workflow monitors several workflows, use a branch per registered workflow and its corresponding Delaro credential. Do not send the source workflow ID in the payload as a substitute for credential scoping.

## Acceptance run

Use a non-production organization and dedicated n8n workflow.

1. Trigger one successful production execution and record the n8n execution ID.
2. Trigger one controlled failure that activates the published Error Trigger workflow.
3. Confirm both appear for the intended client and not for a second test tenant.
4. Replay the successful event ID and confirm the execution/event counts do not increase.
5. Rotate the credential, confirm the old token receives `401`, and update n8n to the new token.
6. Leave reporting idle beyond the current 24-hour freshness window and confirm Delaro labels monitoring as stale rather than live.

## Current limitations

- n8n manual test runs do not invoke Error Trigger workflows. Failure acceptance must use an active/published workflow execution.
- Some trigger-node failures may not expose an n8n execution ID. Those failures cannot be reliably correlated by this first integration pattern.
- The HTTP reporter confirms that n8n sent an outcome; Delaro does not independently inspect the client’s n8n execution payload.
- Supabase Realtime provides immediate updates when available. The client falls back to a 60-second refresh and exposes a manual refresh control.
- Comprehensive monitoring is not established until both a real success and a real Error Trigger failure have been observed from the client-owned n8n instance.
