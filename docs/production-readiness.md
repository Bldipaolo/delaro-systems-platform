# Production readiness — Stage 1 acceptance

Updated 17 November 2026.

**Status: Stage 1 correctness and tenant-isolation controls pass at the database, authenticated Data API, and browser layers. Production invitation delivery remains a release blocker and was not claimed as tested.**

This record covers the hardening work performed after commit `4c0e44b04dacd1499d1a7ad63e2bece09c8f1895`. It does not approve Stage 2 or add product modules.

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
| Post-fix Vercel deployment | NOT TESTED | Release step not yet performed at the time this matrix was written. | Existing production was confirmed on baseline commit `4c0e44b`. | Push the hardening commit, wait for Vercel, and verify READY plus matching Git SHA. |

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
