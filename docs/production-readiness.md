# Production-readiness review — updated 16 November 2026

**Status: Stage 1 operating backbone implemented; production readiness still requires live client acceptance.** The application now supports standard internal onboarding, operational mapping, diagnosis, approval, and implementation-readiness workflows without routine database editing. Do not call the service production-ready until the remaining human release gates below pass.

## Prioritized gaps

1. **Real-user acceptance is outstanding.** A rollback-only SQL test proves important RLS and Stage 1 paths; it does not prove browser invitation delivery, password recovery email delivery, uploads, downloads, or the complete client journey with a real second tenant.
2. **Auth configuration needs a release gate.** Supabase's security advisor reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Enable it, confirm SMTP/rate limits, and test recovery and sign-out in a clean browser with a non-admin test account.
3. **Document controls need an operating policy.** The bucket is private and RLS-bound, but malware scanning, retention/deletion, DLP, and orphan-object cleanup are not implemented. Limit pilot content to approved, non-regulated files.
4. **Not every role/table combination has a negative integration test.** The rollback-only suite exercises two tenants, internal/client/read-only roles, membership suspension, provisioning, operational relationship isolation, publication, approval, measurement, value, and Storage, but not every public table or browser action.
5. **Invitation delivery requires a server secret and Auth configuration.** `SUPABASE_SERVICE_ROLE_KEY` must exist only in server/Vercel environment variables, and the production callback URL must be allowed in Supabase Auth. The code never exposes the key to the browser.

## Stage results and acceptance gates

| Stage | Implemented and migration notes | Tests and security considerations | Acceptance criteria / current result |
| --- | --- | --- | --- |
| 1. Identity, isolation, integrity | Existing SSR password sign-in preserved; recovery link returns to `/account`. Demo requires an explicit development flag. New migrations `pilot_security_integrity`, `fix_pilot_measurement_guard`, `pilot_publication_controls`, and `pilot_measurement_attribution` stamp reviewers/authors, freeze verified records, guard approvals, and separate internal scope from published initiatives. | Unit tests cover demo fail-closed and role/context rules. `supabase/tests/pilot_rls.sql` uses two transient tenants and four users, then rolls back. It checks forged reviewer IDs, immutable verified rows, internal-field privacy, and human approval. Direct SQL tests use `SET LOCAL ROLE authenticated` plus a JWT subject; they are not substitutes for signed API requests. | Database assertions pass. Browser recovery, session persistence, and all-role login still pending. |
| 2. Diagnostic and delivery authoring | Internal pages create/edit/publish areas, teams, responsible people, processes, steps, systems, data sources, handoffs, dependencies, constraints, opportunities, summaries, and improvements. Improvements link directly to processes and systems. Published note fields must be null. | SQL tests confirm cross-tenant improvement/process links fail and private diagnostics remain hidden. App actions validate all relationship endpoints against the active organization. | Code path, typecheck, tests, and build pass. Live browser authoring with a real engagement is pending. |
| 3. Measurement and value | Existing metric/evidence/value models now have internal entry and review forms. Baseline, target, observation, evidence, and realization stay distinct. Verified evidence, baselines, observations, realized-value snapshots, and approved economic models are immutable. No actual result is generated from an estimate. | Rollback-only SQL tests verify database-derived reviewer and approver identity, publication boundaries, and attempted rewrites. Existing economic calculation unit tests verify that incomplete or unapproved models do not enter executive totals. Evidence references still require human scrutiny; a source label alone does not prove truth. | Synthetic SQL flow passes. Acceptance with client-provided source material, a separate reviewer, and displayed Impact totals is pending. |
| 4. Client files | `pilot_client_documents` creates a private 10 MB bucket, tenant-scoped metadata/RLS, restricted MIME types, server upload, and 60-second signed downloads. Client and internal visibility are distinct. | SQL test checks cross-tenant Storage insert denial and client/internal read boundaries. The browser never supplies a trusted storage path or organization ID. No public bucket URL or service-role key is used. | Policy assertions pass. Real file upload/download, malware handling, and retention review remain pending. |
| 5. Stage 1 operating backbone | Client directory, RLS-governed provisioning, invitations, role/status management, validated organization switching, internal decision requests, required approval roles, and implementation approval gates are present. Contextual links connect process → constraint → opportunity → improvement → decision. | Rollback-only tests cover provisioning, suspension, cross-tenant relationship rejection, assigned human approval, required-role enforcement, and immutable responses. | Functional in code and database. Not accepted until a real admin/client browser walkthrough is signed off. |

## Confirmed controls

- The current live project reports **17 applied migrations** and **47/47 public tables with RLS enabled**. Migrations added in this pass are version-aligned locally with the versions recorded by Supabase.
- Server context uses `auth.getUser()`, active memberships, a non-archived organization, and role checks. Browser-provided organization IDs are not authority.
- Internal opportunity scores and private diagnostic/value notes are not on client-readable rows. Draft initiatives are hidden; client-visible operational notes have a database check.
- Approval transitions require the assigned active client member and published option; answered approvals cannot be silently reopened. Verified measurement/value claims cannot be overwritten.
- Production missing-env configuration fails closed. Demo data remains an explicit development-only path.
- File metadata and objects have tenant/visibility RLS, and downloads require a fresh short-lived signature.

## Release blockers requiring human action

1. Enable leaked-password protection in Supabase Auth; verify allowed callback/recovery URLs, email delivery, throttling, reset, and sign-out with a test client user.
2. Provision a real pilot client organization and at least one `client_admin` and one `client_user` through the approved onboarding procedure. Run the full browser/API role matrix, including suspended membership and direct Data API attempts.
3. Run the complete [pilot runbook](pilot-runbook.md) through the new internal client, operations, constraints, opportunities, improvements, and decisions workspaces using client-provided facts. Verify that pending values remain pending and only reviewed results appear as verified.
4. Agree on document classification, retention, deletion, malware scanning, and response to failed metadata registration before uploading sensitive client material.
5. Review deployment logging, backups, incident response, query limits/pagination, and retention of decision/evidence audit records before calling the service production-ready.

## Medium-priority work

- Add pagination and search when the client/member/operational directories outgrow the single-pilot scale.
- Add controlled correction records for immutable verified baselines/models rather than editing history.
- Bound high-volume reads and add correlation IDs and alerting; avoid returning raw database errors to users.
- Perform manual keyboard/screen-reader and mobile acceptance, plus a real-browser upload/download test.

## Verification record

- `npm run typecheck` and `npm run build` passed in an isolated copy of the checkout with the pilot Supabase URL/publishable key; `npm test` passed 12 tests.
- `supabase/tests/pilot_rls.sql` passed against the connected Delaro project. It rolls back all synthetic Auth users, tenant rows, measurements, decisions, and documents. A post-test count confirmed one existing organization/member and zero pilot documents, Storage objects, or value snapshots.
- Built app HTTP smoke on `localhost:3300`: login returned 200; unauthenticated Overview, internal Operations, and file download redirected to login; a callback without a code redirected to the invalid-link state.
- Supabase security advisor still reports the Auth warning above. No production-readiness claim is made.
