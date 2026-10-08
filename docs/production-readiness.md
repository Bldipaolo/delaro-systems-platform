# Production-readiness review

Reviewed 8 October 2026. **Status: not production-ready.** This is a source-and-migration audit, not a live Supabase penetration test. No Supabase project or credentials are configured in this checkout, and the connected Supabase account lists no Delaro project. Applied migrations, effective grants, RLS behavior, auth emails, session refresh, and cross-tenant access have not been exercised against a database.

## Confirmed strengths

- Server context resolves a user with `auth.getUser()`, active memberships, and a non-archived organization. The organization cookie is treated as a preference, not as authority; internal layouts and actions check roles and active organization context (`lib/auth/context.ts`, `app/(delaro)/layout.tsx`). New unit tests cover forged preferences, mismatched action organization IDs, and internal-role allowlisting.
- All tenant-owned tables declared in these migrations have `organization_id`; `profiles` is a user-level table. Migrations enable RLS on all declared `public` tables, including those handled in SQL loops. Most newer relationships use composite `(organization_id, id)` foreign keys. Internal opportunity scores, constraint diagnostics, and event diagnostics are in separately restricted tables.
- Decision responses validate assignee, active membership, published option, and higher-risk confirmation in both the action and a database trigger. Evidence-led economic totals have calculation tests; verified value snapshots require verified evidence, and verified value records are immutable.
- Demo components are generally gated by absent Supabase configuration and use demo-only localStorage keys; production file and review pages show honest empty states instead of demo records. Dialogs have focus management and Escape handling.

## Remaining blockers — resolve before client deployment

1. **Client-visible value models expose internal notes through the Data API.** `value_models.notes_internal` is on the same row that the client SELECT policy publishes (`20261008001253_economic_impact_models.sql`). A loader omitting the field does not prevent an authenticated client from selecting it directly. Move private notes to an internal-only table or expose a client-safe view with appropriate RLS/grants. Audit other published free-text columns (`process_steps.notes`, handoff/dependency notes, `initiatives.scope`) before publication.
2. **Email sign-in lacks a completed SSR callback and sign-out path.** `LoginForm` sends a PKCE magic link directly to `/overview`, while middleware checks authentication before the page can exchange the returned code. There is no callback route and no logout control. Implement and end-to-end test code exchange, cookie refresh, logout, expired links, and unauthorized/no-membership states. Supabase's [SSR PKCE guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide) describes the required code exchange and cookie flow.
3. **Some legacy foreign keys are not tenant-composite.** In `0002_opportunities_initiatives.sql`, `opportunity_client_summaries`, `opportunity_score_snapshots`, `initiatives`, `initiative_internal_details`, and `initiative_milestones` reference opportunity/initiative IDs without pairing `organization_id`. App actions validate their own references, but direct Data API writes permitted by RLS can create cross-organization links. Add composite FKs with a migration after checking/repairing existing data; test malicious IDs across two tenants.
4. **Human approval can be bypassed by changing decision kind.** `private.validate_decision_transition()` checks approval counts only when `NEW.kind = 'approval'`. An internal editor can update an approval decision to another kind and set `status='approved'` in one write; the current internal RLS policy allows that update. Make kind immutable after creation and enforce approval evidence on all approval-like transitions. Test at the SQL/API boundary, not just through the form.
5. **Verified measurement claims are mutable or can impersonate a verifier.** Unlike value snapshots, `measurement_evidence`, baselines, and observations have no append-only guard after verification. Verification fields across measurement/value tables can be supplied directly by an internal API caller rather than derived from `auth.uid()` and the server clock. This weakens auditability and can turn unsupported values into client-visible results. Enforce verifier identity, evidence state, and immutable verified records in DB triggers; add two-role negative RLS tests.
6. **Legacy `process_metrics.actual_value` is client-readable without evidence verification.** Its publication policy reveals the row when `client_visible=true`; no evidence/status gate applies. Retire that actual-value path or restrict it until the evidence-backed measurement model is authoritative.
7. **Demo is selected automatically when environment variables are absent.** A misconfigured production deployment would expose the public demo, including internal demo routes. Require an explicit development/demo flag and fail closed in production. `app/(auth)/login/page.tsx` checks only URL while other modules require URL and key, causing a partial-config state.
8. **No live verification of effective schema or RLS.** Apply the migrations in a disposable Supabase project, run advisors, inspect grants/policies/views/functions, and execute anonymous, client A, client B, read-only, and Delaro-role access tests. Do not invite real client data before this gate passes.

## Medium-priority improvements

- Add `error.tsx` and `loading.tsx` boundaries and explicit no-membership/unauthorized screens. `getInitiatives()` and `getOpportunities()` currently return empty arrays on query errors, masking outages as empty workspaces. Some actions return raw database errors to the browser; use safe messages and structured server-side logs.
- Add rate limiting/abuse controls for OTP requests and write actions, plus server error reporting with tenant-safe correlation IDs. Operational events capture business exceptions, not app failures or failed actions.
- Review publication fields and document/evidence URLs as a separate data-access policy. Files are demo-only; storage, signed download URLs, retention, and document visibility policies are not implemented.
- Bound large reads. Operations loads many entire tenant tables in parallel; decisions, metrics, evidence, and value models have unpaginated reads and repeated in-memory `find` joins. PostgREST row limits can silently truncate these views. Add pagination/targeted queries and profile realistic tenant sizes.
- Strengthen integrity around positive/finite durations, timestamps, deletion/retention of audit records, and legacy owner/profile references. Organization cascade deletes can erase evidence and decision history; define a retention/archive policy before real use.
- Add integration tests for membership suspension, multi-organization switching, direct Data API access to private columns, all RLS policy groups, decision transitions, evidence verification, and auth callback/logout. Unit tests alone cannot prove database isolation.
- Finish a keyboard and screen-reader pass on responsive maps/tables, form errors, and mobile navigation using automated checks plus manual testing. Visible focus and dialog focus exist, but full assistive-technology behavior is unverified.

## Future enhancements

- Provision profiles/memberships through a controlled onboarding workflow with audit logs; there is no automatic profile/membership bootstrap in the migrations.
- Add measured performance budgets, request tracing, and alerting for failed loads/actions; review Supabase advisor findings and query plans after real data exists.
- Introduce document storage and review records only after their access, retention, and publication rules are defined.

## Verification performed

- `npm run build` — pass.
- `npm run typecheck` — pass.
- `npm test` — 8 passing tests (4 existing economic calculations, 4 new authorization/context tests).
- No database migrations were applied in this review; no live Supabase/RLS test result is claimed.
