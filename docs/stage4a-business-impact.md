# Stage 4A — Business impact and measurement

## Model

Delaro reuses the existing evidence-led measurement architecture:

`Workflow → workflow_metrics → Metric → Baseline / Target / Observation → Evidence → Verified result → Value realization`

Automated ingestion adds observations; it does not create baselines, targets, evidence approvals, or economic claims.

## Trust states

- **Unverified** — manually submitted or incomplete record.
- **Estimated** — modeled value, never an actual result.
- **Observed** — received with a valid scoped integration credential; not human-verified.
- **Verified** — reviewed by an authorized Delaro internal member with verified, client-visible evidence.

Verified records retain the existing database immutability rules. An observed value cannot be promoted by the reporting integration.

## n8n metric reporting

1. Define a metric in **Internal → Metrics** and link it to a workflow.
2. Open the metric workbench and choose **Connect automated observations**.
3. Create or rotate the metric-scoped credential. Copy it once; Delaro stores only its SHA-256 digest.
4. Import [`delaro-metric-reporter.json`](/integrations/n8n/delaro-metric-reporter.json) into n8n or configure an HTTP Request node manually.
5. Store `Bearer <token>` in n8n Header Auth. Never put the token in the JSON body.

Endpoint:

`POST https://delaro-systems-platform.vercel.app/api/integrations/n8n/measurements`

Example body:

```json
{
  "eventId": "{{$execution.id}}-duration",
  "value": 12.5,
  "unit": "seconds",
  "measuredAt": "{{$now.toISO()}}",
  "sampleSize": 1,
  "aggregation": "single execution",
  "sourceReference": "n8n execution {{$execution.id}}",
  "source": "n8n_metric_reporter"
}
```

The unit must exactly match the metric definition. `eventId` is the idempotency key. Repeating it returns `duplicate: true` without creating another observation.

## Publication and verification

Metric definitions are private unless `client_visible` is enabled. Authenticated observations remain internal unless `auto_publish_observations` is enabled. Published observations are labeled **Observed · not verified**. Only the existing evidence review workflow can create a verified result.

## Security boundaries

- Credentials are scoped to one tenant and metric, and optionally one linked workflow.
- Raw tokens are shown once and never stored by Delaro.
- The browser never receives the Supabase service-role key.
- RLS hides credentials, rate counters, and ingestion events from client roles.
- The ingestion RPC validates credential status, expiry, rate limit, metric unit, timestamp bounds, payload digest, and idempotency.
- Cross-tenant workflow/metric linkage is prevented with composite foreign keys and RLS.

## Current live pilot state

The live **Test Email Agent** is linked to an internal-only `Email processing duration` metric measured in seconds. No baseline, target, observed result, verified result, or economic impact was fabricated. A genuine n8n report is still required before connectivity can be claimed end to end.
