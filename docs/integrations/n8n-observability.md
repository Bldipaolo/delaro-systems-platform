# n8n execution observability

Delaro accepts small, authenticated outcome events from explicitly registered n8n workflows. A workflow can be registered directly for a client or linked to a formal consulting implementation. Delaro does not connect to the n8n API, store n8n login credentials, or retain workflow inputs and outputs.

## Security model

- A Delaro internal user selects an authorized client organization and registers the n8n workflow in **Internal → Workflow monitoring**. An implementation is optional.
- Registration creates a workflow-scoped reporter token in the same database transaction. Only its SHA-256 hash is stored; the plaintext token is shown once.
- The token resolves the organization and workflow on the server. The request body has no organization or workflow identifier to trust.
- Rotation creates a new token and revokes the prior token in one database transaction. Revocation is immediate. No client n8n login or API credential is collected.
- PostgreSQL rejects `connected` or `degraded` status without matching authenticated execution evidence. `stale` is derived from the last received event.
- Events are limited to 32 KB and a configurable per-credential request limit. Unknown JSON fields are rejected.
- Only identifiers, timing, status, source, and a sanitized error code/summary are retained. Never send customer records, credentials, node inputs, node outputs, stack traces, or complete n8n execution payloads.

## Connect the first workflow

1. Open **Internal workspace → Workflow monitoring**, select the client organization, and choose **Connect workflow**.
2. Select n8n Cloud or self-hosted n8n, enter the workflow name and its credential-free HTTPS URL or n8n Cloud workflow ID, then choose **Register and generate credential**. Process, implementation, owner, description, and metric links are optional and can be added later.
3. Copy the reporter token immediately. The record is `configured`, not connected, until the first authenticated execution arrives.
4. In the client-owned n8n instance, create a reusable **Header Auth** credential:
   - Name: `Delaro execution reporter`
   - Header: `Authorization`
   - Value: `Bearer <one-time Delaro token>`
5. Add an **HTTP Request** node as the final node of a dedicated test workflow:
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

6. Run the workflow once and confirm a `202` response. Replaying the same `eventId` returns `200` with `duplicate: true` and does not add another event.
7. Confirm the internal record becomes connected and the execution appears in the correct client’s **Workflows** page. A successful HTTP response proves event receipt, not the business outcome of the workflow.

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

### Importable templates

The internal Workflow monitoring page exposes three credential-free templates:

- `delaro-success-reporter.json` — import it, select the workflow-scoped **Delaro Execution Reporter** Header Auth credential, then copy **Report Success to Delaro** onto the real success-only path. Do not leave the Manual Trigger connected in the production workflow.
- `delaro-error-reporter.json` — import it as a separate workflow, select the same workflow-scoped Header Auth credential, and publish it. In the monitored workflow choose **More actions → Settings → Error workflow**, select the imported error reporter, and save.
- `delaro-controlled-failure-test.json` — import it as an isolated workflow, assign the error reporter under Workflow Settings, publish it, and send an empty `POST` request to its production webhook URL. It intentionally stops with a fixed non-sensitive error and must not be connected to business-processing nodes.

The Error Trigger template prefers n8n's original failed `execution.id`. Trigger-node failures may not have one, so the template creates a bounded fallback identifier from the source workflow ID and trigger timestamp. This preserves idempotency without sending the source workflow ID as trusted tenant context; the reporter credential remains the only authority for organization and workflow attribution.

Do not paste a Delaro token into exported workflow JSON. The placeholder credential reference must be replaced in n8n after import. n8n only activates Error Trigger for automatic executions, so publish both the monitored workflow and the error workflow before acceptance testing.

### Coverage labels

- **Success reporting verified** means at least one authenticated `n8n_workflow_reporter` success exists.
- **Failure reporting verified** means at least one authenticated `n8n_error_trigger` failure exists.
- **Connected · failure reported** means telemetry is arriving and the latest execution failed. It is not a monitoring disconnection.
- **Monitoring stale** means no recent authenticated report arrived within the freshness window. It does not prove the business workflow failed.

## Acceptance run

Use a non-production workflow and, when possible, a dedicated test organization. `Atlantic Operations Group` is available in the connected pilot project, but do not mark its workflow connected until a genuine n8n Cloud execution has been observed.

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
