# Stage 4C automated measurement sources

Stage 4C extends the existing Stage 4A observation model instead of creating provider-specific measurement stores.

```text
Client system
  → measurement_sources
  → measurement_source_mappings
  → authenticated push or scheduled pull
  → ingest_mapped_metric_observation
  → metric_observations
  → metric-derived value_model_inputs
  → Impact
```

Delaro measures operations, not customer content. Provider adapters request only mapped fields and persist only normalized numeric observations, bounded source references, hashes, timestamps, and audit counts. Raw CRM records, email bodies, attachments, notes, credentials, and provider responses are not stored.

## Core records

- `measurement_sources` contains tenant-scoped, client-safe connection metadata, category, environment, cadence, freshness, and evidence-derived health.
- `measurement_source_mappings` links a source to an existing Delaro metric through constrained field paths, transformations, aggregation, and period grouping.
- `measurement_sync_runs` is an internal, payload-free audit ledger for scheduled, manual, and retry attempts.
- `measurement_source_ingestion_events` provides idempotency and observation provenance without retaining provider payloads.
- `private.measurement_source_secrets` contains application-encrypted provider credentials. Normal authenticated users have no table or RPC access.
- `private.measurement_source_sync_state` contains bounded, non-secret incremental cursors. It is also service-only.

Every public record carries `organization_id`. Composite tenant foreign keys, application checks, and RLS prevent a source, mapping, metric, observation, or run from crossing organizations. The two private tables use deny-by-default RLS and are reachable only through service-role RPCs that validate the caller role and tenant relationship.

## Push and pull

Push sources reuse the existing Stage 4A metric reporter and Stage 3 n8n reporter architecture: credentials are scoped, revocable, hashed, rate limited, and resolved server-side. Existing n8n workflows were backfilled into the source registry and do not need to reconnect.

Pull sources are claimed by the server-only scheduler at `/api/measurement-sources/sync`. Vercel invokes it every 15 minutes with `CRON_SECRET`; PostgreSQL atomically claims due rows and prevents concurrent runs for the same source. The provider adapter fetches bounded records, normalization produces the existing Stage 4A observation contract, and PostgreSQL applies the final transformation and idempotency checks.

Transient failures use bounded exponential backoff. Authentication, authorization, invalid mapping, and configuration failures stop the schedule and require an internal operator to reconnect or repair the source. A successful connection test produces `configured`; only a successful sync or authenticated observation produces `healthy`.

## HubSpot reference adapter

The reference connector uses a scoped HubSpot Service Key as a Bearer credential. Delaro tests one selected CRM object before storing the credential, requests only properties required by active mappings, follows at most five 100-record pages per run, classifies provider errors, and keeps a private per-object cursor. The initial incremental strategy is append-oriented and is appropriate for count/volume metrics. A future update-aware adapter should use HubSpot search filters or webhooks for mutable-record metrics.

The key is encrypted with AES-256-GCM. The 32-byte key lives only in `MEASUREMENT_SOURCE_ENCRYPTION_KEY`; authenticated context (organization, source, secret type, key version) is bound as additional authenticated data, so ciphertext cannot be moved to another source or tenant. Reconnection rotates the stored ciphertext. **Remove credential** deletes it and returns the source to draft while historical observations and provenance remain.

Required HubSpot access should be read-only and limited to the mapped objects. A new Service Key is preferred for account-level data synchronization. No live HubSpot account was authorized during implementation, so provider acceptance remains pending even though fixture, database, and scheduler contracts are tested.

## Mapping and trust

Supported transformations are explicit: identity, scale and offset, milliseconds to seconds, minor currency to major currency, and fraction to percentage. Supported aggregations are latest, count, sum, average, median, minimum, and maximum with event/day/week/month/quarter grouping. Field paths reject arrays, executable expressions, and prototype-related keys. HubSpot object names are restricted in both the action and PostgreSQL trigger.

Imported observations are `observed` and `submitted`. API provenance does not make a business or financial result verified. Existing evidence review and verified-record immutability remain unchanged. When a source is no longer healthy, metric-derived economic inputs are marked stale without erasing historical values.

## Adding another provider

1. Add the provider identifier and category without adding provider-specific columns to the observation model.
2. Implement a server-only adapter under `lib/measurement-sources/providers/` with connection validation, bounded field selection, pagination/cursor behavior, timeout and rate-limit classification.
3. Store credentials through a provider-specific encrypted-secret wrapper. Never pass plaintext through React props or public tables.
4. Normalize records with `normalizeProviderRecords` and insert only through `ingest_mapped_metric_observation`.
5. Extend `executeClaimedSource` with a provider branch and preserve the same sync result contract.
6. Add fixture tests for authorization, pagination, cursors, malformed records, duplicate records, timeout, rate limit, and revoked access.
7. Add rollback SQL tests for tenant isolation, RLS, secret isolation, mapping linkage, health, and idempotency.
8. Complete a genuine provider acceptance run before describing the connector as live.

## Production configuration

```bash
CRON_SECRET=                         # random value, at least 24 characters
MEASUREMENT_SOURCE_ENCRYPTION_KEY=   # exactly 32 random bytes, base64url encoded
SUPABASE_SERVICE_ROLE_KEY=           # server only
```

Rotate the encryption key only with a planned re-encryption migration. Rotating a HubSpot Service Key is routine: reconnect the source, run a manual sync, verify health, and revoke the old key in HubSpot. Never print either key in logs or documentation.

## Current limitations

- Live HubSpot authorization and end-to-end provider acceptance are not tested.
- The reference cursor is append-oriented; mutable-record update capture needs HubSpot search/webhook support before those mappings are relied upon.
- Backfill is represented by bounded fixture and mapping architecture but has no operator-facing backfill workflow yet.
- Source alerts are visible in health and Impact; external email/Slack alert delivery is intentionally not implemented.
