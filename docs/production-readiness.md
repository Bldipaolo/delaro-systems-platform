# Production readiness — Stage 1 acceptance

Updated 17 November 2026.

**Status: Stage 1 correctness and tenant-isolation controls pass at the database, authenticated Data API, and browser layers. Production invitation delivery remains a release blocker and was not claimed as tested.**

This record covers the Stage 1 hardening performed after commit `4c0e44b04dacd1499d1a7ad63e2bece09c8f1895` and the focused Stage 2 implementation-management verification appended below.

## Acceptance matrix

| Journey or control | Result | Actual test method | Evidence / reproduction | Remaining blocker |
| --- | --- | --- | --- | --- |
| Baseline commit review | PASS | Inspected Git `main` at `4c0e44b` and traced the four reported paths before editing. | Reproduced action-only initiative approval, ignored callback `next`, split provisioning writes, and `listUsers({ page: 1, perPage: 1000 })`. | None. |
| Database implementation-approval guard | PASS | Live rollback SQL with `SET LOCAL ROLE authenticated`; authenticated Data API update using a real test session. | Build, Test, Deploy, Measure, and Complete were rejected before approval with PostgreSQL `P0001`. Build and Complete succeeded after the assigned client approval finalized the linked decision. | None. |
| Atomic, retry-safe organization provisioning | PASS | Live rollback SQL called `provision_client_organization` twice with one request UUID, attempted it as `client_admin`, and injected a membership trigger failure. | One organization and one owner membership after retry; unauthorized call rejected; forced membership failure left zero organization rows. | None. |
| Existing-account and duplicate-invite resolution | PASS | Node unit tests with Auth/profile directory mocks. | Existing users resolve by the profile email index and `getUserById`; a concurrent duplicate-invite race resolves the newly created account. No Auth-user pagination is used. | Live email delivery still untested. |
| Safe invitation callback redirect | PASS | Unit tests for callback destination validation plus production build. | `/account` is accepted; external, protocol-relative, backslash, and internal-workspace redirects fall back to `/overview`; recovery always returns `/account?recovery=1`. | None in code. |
| Brand-new invitation → password setup | NOT TESTED | Attempted public Auth creation and inspected Auth logs. | Supabase returned `over_email_send_rate_limit`; Vercel does not have `SUPABASE_SERVICE_ROLE_KEY`, so the application invitation action could not be executed. | Configure the server-only key, SMTP/rate limits, and allowed production callback; then complete one real invitation. |
| Password login and session-backed workspace | PASS | Authenticated browser smoke on the production build with two temporary password users. | Both internal and client users reached `/overview`; internal user reached `/opportunities`; client user received no internal-navigation control. | Invitation-originated session remains untested. |
| Organization selection | PASS | Authenticated browser smoke with one internal user holding two active memberships. | `/clients` displayed both authorized tenants; switching changed the active client from Acceptance A to Acceptance B. | None. |
| Operational mapping | PASS | Authenticated Data API writes plus client browser `/operations`. | Created an area, process, step, and published constraint. Client page rendered one area, one process, mapped flow, and one known constraint. | No real client data was used. |
| Constraint → opportunity → business case → improvement | PASS | Authenticated Data API lifecycle and rollback SQL regression test. | Private diagnostic linked the mapped constraint to an opportunity; client summary, economic model, and improvement were created in one tenant. Client could not select `constraint_diagnostics`. | None for Stage 1 correctness. |
| Human approval and implementation transition | PASS | Assigned client updated the approval through the Data API; internal user then transitioned the improvement. | Decision received `status=approved` and `decided_at`; pre-approval Build failed, post-approval Build passed. An unassigned internal response failed with `P0001`. | None. |
| Baseline and observation verification | PASS | Authenticated Data API plus client browser `/impact`. | Evidence, baseline, and one observation were verified; a second submitted observation remained hidden. Impact showed baseline 24 hours and latest verified 16 hours. | None for tested path. |
| Verified economic result | PASS | Authenticated Data API plus client browser `/impact`. | Published model showed $500 theoretical, $300 recoverable, $150 expected, and one separately labeled $500 verified cumulative period. A pending second period was excluded. Values were synthetic acceptance data and then deleted. | None for tested path. |
| Client reporting excludes pending results | PASS | Client-role Data API queries and browser Impact view. | Query returned exactly one verified observation and one verified realization snapshot; pending rows returned zero client-visible records. | None. |
| Cross-tenant reads and writes | PASS | Authenticated client Data API against a second tenant plus rollback SQL. | Read returned zero rows; write failed with PostgreSQL `42501`; composite tenant foreign keys rejected cross-tenant links. | Not every table/role pair has a dedicated negative test. |
| Suspended-user access | PASS | Admin suspended the client membership while the client session remained valid, then client queried organizations/processes. | Both queries returned zero rows; membership was reactivated for the remaining smoke test. | Session revocation is not immediate; RLS denied data using live membership status. |
| Client access to internal records/routes | PASS | Client Data API query and authenticated browser request to `/internal/operations`. | Internal diagnostic query returned zero rows; internal URL redirected to `/overview`. | None. |
| Verified-record immutability | PASS | Rollback SQL attempted changes to verified evidence, baseline, observation, realized value, and approved model. | Every mutation was rejected; reviewer/approver membership IDs were database-derived. | Controlled correction records remain future work. |
| Full unit suite | PASS | `npm test`. | 26 tests passed, 0 failed. | Node emitted existing module-type performance warnings only. |
| TypeScript | PASS | `npm run typecheck` in an isolated checkout. | Exit code 0. | None. |
| Production build | PASS | `npm run build` with the existing public Supabase environment. | Next.js 15.5.29 compiled and generated 31 routes. | None. |
| SQL integration suite | PASS | Executed `supabase/tests/pilot_rls.sql` against project `qxebrulkxkdvovleoqao`. | Reported: `pilot RLS, Stage 1 tenancy, atomic provisioning, relationship, suspension, and approval assertions passed`; transaction rolled back. | None. |
| Test-fixture cleanup | PASS | Deleted the temporary acceptance tenants/users and re-counted project records. | Returned to one Auth user, one organization, one membership; zero Stage 1 test users or organizations remained. | None. |
| Post-fix Vercel deployment | PASS | GitHub push auto-deploy, Vercel deployment API inspection, and unauthenticated HTTP smoke checks. | Production deployment `dpl_7D1iN3dEdmcEqHvUxiPDBVqfj2nY` reached `READY`; both Vercel Git source fields matched hardened application commit `0b7f7b5103c872a3a4473296d64e7a57bc6ea215`. `/login` returned `200`, and `/internal/decisions` returned `307` to `/login`. | Invitation delivery configuration remains a separate blocker. |

## Applied migrations

- `stage1_hardening_acceptance`: adds the PostgreSQL initiative-approval trigger and transactional provisioning RPC.
- `fix_atomic_provisioning_retry`: handles PostgreSQL RLS/`ON CONFLICT` interaction and permits only the owning Delaro administrator to reconcile an orphaned provisioning row.

The original Stage 1 migrations and both hardening migrations are applied to Supabase project `qxebrulkxkdvovleoqao`. The integration suite rolls back all of its own fixtures.

## Confirmed controls

- Initiative implementation state is now a PostgreSQL invariant, not merely a server-action check.
- Organization provisioning uses one `SECURITY INVOKER` database transaction and an idempotency UUID supplied by the form.
- Invitation account lookup no longer enumerates the Auth directory or assumes fewer than 1,000 users.
- Callback destinations use a local allowlist and preserve password-recovery behavior.
- Tenant relationships retain composite foreign keys, application authorization, and RLS.
- Internal diagnostics and pending measurements/value periods do not appear on client surfaces.
- Next.js was updated from the vulnerable lockfile version to `15.5.29`; Zod was updated to `4.6.7`.

## Remaining release blockers

1. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel as an encrypted, server-only variable. Never prefix it with `NEXT_PUBLIC_`.
2. Configure and verify production SMTP/rate limits and Supabase Auth redirect URLs, then execute a genuine invitation through `/auth/callback?next=/account`, set a password, sign out, and sign back in.
3. Enable Supabase leaked-password protection.
4. Resolve or formally risk-accept the PostCSS advisory bundled by Next.js 15.5.29. npm reports the remaining automated fix as a Next.js 16 major upgrade; that upgrade was not introduced during this focused Stage 1 pass.
5. Complete a real-browser client document upload/download test and approve document retention, malware scanning, and deletion procedures before sensitive files are accepted.

## Medium-priority follow-up

- Add negative coverage for every role/table combination rather than only the highest-risk tenant, approval, measurement, and value paths.
- Add controlled correction records for immutable verified claims.
- Add CI deployment checks so Vercel promotion is gated on unit, TypeScript, build, and SQL integration results.
- Perform manual keyboard, screen-reader, and mobile acceptance with the pilot client.

## Stage 2 implementation-management verification — 17 November 2026

Stage 2 adds implementation records beneath approved improvements without connecting to external n8n instances or storing client credentials.

| Journey or control | Result | Actual test method | Evidence / limitation |
| --- | --- | --- | --- |
| Approved improvement → implementation | PASS | Rollback SQL with an authenticated internal JWT subject. | Implementation actor membership was database-derived; parent improvement had a genuine client approval. |
| Structured architecture | PASS | Rollback SQL inserted architecture controls and ordered input, processing, decision, and output items. | Architecture is internal-only. No secret-bearing fields exist. |
| Two n8n workflows registered | PASS | Rollback SQL inserted development and staging workflow metadata under one implementation. | Metadata only; no live n8n connection or credentials. |
| Milestone and publication | PASS | Rollback SQL inserted an implementation-linked initiative milestone and queried it as the client role. | Client saw the published milestone, not private milestone details. |
| Failed test blocks readiness | PASS | Direct authenticated database transition after a required failed test. | PostgreSQL rejected `ready_for_deployment`. |
| Client acceptance enables readiness | PASS | Internal review accepted the criterion, passed the remediated test, and an assigned client approved the linked acceptance decision. | PostgreSQL then allowed `ready_for_deployment`. |
| Deployment bypass prevention | PASS | Direct database update to `deployed` before a deployment record. | PostgreSQL rejected the transition. |
| Immutable deployment history | PASS | Inserted version `1.0.0`, transitioned to Deployed, then attempted an update. | Update was rejected; deployments are append-only. |
| Monitoring ownership | PASS | Attempted Monitoring before operational ownership, then supplied owner/support responsibility. | First transition failed; second passed while retaining the explicit `Monitoring not connected` state. |
| Cross-tenant implementation references | PASS | Attempted an implementation/process link using another tenant's process. | Composite foreign key rejected it. |
| Client privacy boundary | PASS | Queried published implementation data as the client role. | Client saw the implementation and milestone but not architecture, internal details, or workflow registry rows. |
| TypeScript | PASS | `npm run typecheck` in an isolated local checkout. | Exit code 0. |
| Unit tests | PASS | `npm test` in the isolated checkout. | 29 passed, 0 failed. |
| Production build | PASS | `npm run build` with the configured public Supabase environment. | Next.js 15.5.29 compiled 32 routes, including `/internal/implementations`. |
| SQL integration suite | PASS | Executed `supabase/tests/pilot_rls.sql` against `qxebrulkxkdvovleoqao`. | Stage 1 and Stage 2 assertions passed; all fixtures rolled back. |
| Authenticated browser smoke | PASS | Temporary internal test identity and test organization against the local production build. | Password login, active organization context, internal navigation, and the implementation registry rendered successfully. Exact fixtures were deleted and zero remained. |
| Stage 2 Vercel deployment | PASS | Vercel deployment API inspection, production alias inspection, runtime error scan, and unauthenticated HTTP smoke checks. | Deployment `dpl_9vanxcRx1uznAcKtcvjMSc13xADi` reached `READY`; Git source matched `a26d7d4779610add44933f762d1d322769539406`; the production alias was attached; `/login` returned `200`; `/internal/implementations` returned `307` to `/login`; no error-level runtime logs were returned for the first hour. |
| Full browser lifecycle authoring | NOT TESTED | Not executed through every form. | The equivalent lifecycle and negative controls were executed through authenticated SQL; complete multi-form browser acceptance remains required before a live engagement. |
| Live n8n monitoring | NOT TESTED | Out of Stage 2 scope. | Stage 3 must add authenticated event ingestion before health or execution history can be reported. |

Applied Stage 2 migrations:

- `stage2_implementation_management`
- `stage2_foreign_key_indexes`

Post-migration Supabase security and health advisors reported no new schema finding. Leaked-password protection remains the existing Auth release blocker. Performance advisories still include legacy policy/index recommendations; the foreign-key paths introduced by Stage 2 received focused covering indexes.

## Stage 3A live n8n observability — 21 November 2026

Stage 3A establishes the authenticated reporting boundary and client monitoring interface. It does not claim a completed n8n end-to-end connection until a real client-owned workflow reports both a production success and an Error Trigger failure.

| Journey or control | Result | Actual test method | Evidence / limitation |
| --- | --- | --- | --- |
| Workflow-scoped credential creation and rotation | PASS | Live rollback SQL called the authenticated rotation RPC as a Delaro internal role. | Plaintext token is returned only by the server action; the database stores a SHA-256 hash and short hint. Rotation revokes the prior credential transactionally. |
| Invalid credential rejection | PASS | Live rollback SQL called the service-role-only ingestion RPC with the wrong hash. | PostgreSQL returned `42501`; no execution or event row was written. |
| Success and failure ingestion | PASS | Live rollback SQL submitted one successful reporter event and one Error Trigger failure event. | Two current execution rows and three immutable event rows were asserted; all fixtures rolled back. These were simulated protocol events, not actual n8n runs. |
| Idempotency | PASS | Replayed the same workflow/event identifier through the ingestion RPC. | Response marked the replay as duplicate and the event count remained one. |
| Out-of-order safety | PASS | Sent a late `started/running` event after a terminal success. | The audit event was retained and the current execution remained `successful`. |
| Rate limiting | PASS | Set the test credential to four requests per minute and attempted a fifth request. | PostgreSQL raised `program_limit_exceeded`; no fifth execution was written. |
| Payload and error minimization | PASS | Node protocol tests and code inspection. | Strict 32 KB JSON schema rejects unknown fields; common credentials, email addresses, and secret query parameters are redacted from the 500-character error summary. Raw workflow payloads are not stored. |
| Client execution visibility | PASS | Live rollback SQL queried as an active client admin on the published implementation. | Client read two safe execution records and one safe workflow projection, but zero credential or raw event-audit rows. |
| Cross-tenant and suspended access | PASS | Live rollback SQL changed JWT subjects to a second tenant and suspended user. | Both received zero workflow execution rows; direct client insert was denied. |
| Realtime event delivery | NOT TESTED | Verified the table is in `supabase_realtime`; built and browser-smoked the subscription and fallback component. | Client subscribes under its authenticated RLS session, falls back to a 60-second refresh, and exposes manual refresh. A real event-driven browser update awaits the actual n8n acceptance run. |
| Client overview and detail | PASS | Demo-mode browser smoke at `/workflows` and `/workflows/demo-order-sync`. | Overview, freshness, status history, duration, safe failure summary, and drilldown rendered without runtime errors. Demo data was explicitly labeled illustrative. |
| Internal credential controls | PASS | Demo-mode browser smoke at `/internal/workflows`; live SQL tested the backing actions/RPC rules. | Registered workflows, one-time token creation, rotation, revocation, and credential ledger are present. No n8n login or API key field exists. |
| Unit suite | PASS | `npm test`. | 38 tests passed, 0 failed, including the exact middleware exception required by the credential-authenticated endpoint. |
| TypeScript | PASS | `npm run typecheck`. | Exit code 0. |
| Production build | PASS | `npm run build`. | Next.js 15.5.29 compiled 35 routes including ingestion, client Workflows, detail, and internal monitoring. |
| SQL integration | PASS | Executed `supabase/tests/stage3a_workflow_observability.sql` on project `qxebrulkxkdvovleoqao`. | Ingestion, idempotency, ordering, rate limit, private-record, cross-tenant, and suspension assertions passed; all fixtures rolled back. |
| Actual n8n success | NOT TESTED | No client-owned n8n instance or workflow was available in this session. | Follow `docs/integrations/n8n-observability.md` and run a published test workflow. This is a Definition-of-Done blocker. |
| Actual n8n Error Trigger failure | NOT TESTED | No published n8n Error Trigger workflow was available. | Trigger one controlled production failure. Manual n8n executions do not activate Error Trigger. This is a Definition-of-Done blocker. |

Applied Stage 3A migrations:

- `stage3a_live_n8n_observability`
- `stage3a_advisor_hardening`
- `stage3a_execution_policy_hardening`

The post-migration Supabase security advisor reports one intentional warning for the client-safe `get_client_workflow_monitoring` `SECURITY DEFINER` RPC. It is executable only by authenticated users, verifies active organization membership internally, returns an explicit safe column projection, and does not expose instance references, external workflow IDs, credential data, or raw event records. Leaked-password protection remains a separate pre-existing Auth blocker.

## Stage 3B simplified workflow onboarding — 23 November 2026

Stage 3B removes the implementation prerequisite from workflow monitoring without creating a second ingestion path. Existing implementation-linked workflows remain in `implementation_workflows`; the implementation relationship is now optional, and direct registrations use the same scoped credentials, event tables, client projection, and monitoring UI.

| Control | Result | Actual verification | Remaining blocker |
| --- | --- | --- | --- |
| Direct client registration | PASS | Applied `simplify_n8n_workflow_onboarding`; rollback SQL called `register_monitored_workflow` with no implementation and asserted the workflow plus credential were created atomically. | None in schema/action path. |
| Tenant and role enforcement | PASS | SQL changed JWT subjects across two organizations. A foreign internal user could not register in tenant A; tenant B client received no tenant A workflow or executions. | Browser role smoke still required after deployment. |
| Credential storage | PASS | SQL asserted the credential row contains only a SHA-256 digest and token hint. Client roles read zero credential rows. | Plaintext token must be copied once into the client-owned n8n credential store. |
| Evidence-derived status | PASS | Direct `connected` update before telemetry raised `check_violation`; authenticated success changed the workflow to connected and a newer authenticated failure changed it to degraded. | Stale remains time-derived in the application and needs a live elapsed-time acceptance check. |
| Existing linked workflows | PASS | The Stage 3B SQL suite inserted an implementation-linked workflow and verified the client projection returned it alongside the standalone workflow. The Stage 3A SQL suite also passed after migration. | None found. |
| Client-safe visibility | PASS | Standalone published workflow and execution rows were visible only through the client-safe projection/RLS. Instance URL, external ID, credentials, and raw event audit remained internal. | None found. |
| Unit and TypeScript checks | PASS | `npm test` passed 40/40, including workflow parser, state, credential, payload, and mobile checks; `npm run typecheck` exited 0. | None. |
| Production build | PASS | A clean lockfile install followed by `npm run build`; Next.js 15.5.29 compiled all 35 routes, including internal onboarding and ingestion. | None. |
| Regression SQL | PASS | `pilot_rls.sql`, `stage3a_workflow_observability.sql`, and `stage3b_workflow_onboarding.sql` all passed against the connected project with fixtures rolled back. | None. |
| Atlantic Operations Group readiness | PASS | Live read-only query confirmed the active organization and one active internal membership. | A real workflow URL/ID and n8n access are required from the operator. |
| Genuine n8n Cloud execution | NOT TESTED | No n8n Cloud workflow or execution credential was available in this session. | Required before claiming end-to-end connectivity. |

Applied Stage 3B migration:

- `simplify_n8n_workflow_onboarding`
- `allow_service_telemetry_updates`

The post-migration advisor found no new health or security finding. The existing client-safe `get_client_workflow_monitoring` warning and disabled leaked-password protection remain as documented above. Performance advice remains limited to pre-existing policy/index recommendations plus expected unused-index notices on newly created test-age indexes.
