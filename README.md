# Delaro Systems Platform

Delaro Systems is a client platform for making improvement work easy to follow: clients can see how operations work, the improvements underway, evidence-backed and economic impact, shared files, and decisions requiring their input. The repository also includes an internal Delaro workspace for managing opportunities and client work.

## Tech stack

- Next.js 15 App Router
- React 19 and TypeScript
- CSS with shared design tokens in `app/globals.css`
- Supabase JS and `@supabase/ssr` integration points
- Zod validation
- Supabase SQL migrations

## Run locally

Node 22 is the recommended local runtime:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm ci
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

Open `http://localhost:3000`. For an explicitly isolated development demo, set `NEXT_PUBLIC_DELARO_DEMO_MODE=true` with Supabase variables absent. Production builds require a complete Supabase URL and publishable key and never silently fall back to demo data.

For a faster production preview:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run start
```

The package manager lockfile is `package-lock.json`.

## Environment variables

Copy `.env.example` to `.env.local` when connecting Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_DELARO_DEMO_MODE=
```

Only the browser-safe Supabase URL and publishable key belong in this file. No service-role key, password, access token, or production credential should be committed. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still accepted for older environments. Allow the exact local origin in Supabase Auth (for example `http://localhost:3200/auth/callback` and its recovery query-string variant) and the deployed HTTPS callback. Keep demo mode off for pilot and production deployments.

## Project structure

- `app/(portal)/` — client workspace routes: Home, Operations, Activity, Improvements, Impact, Files, and Decisions. Check-ins remain available as records at `/reviews`. Legacy `/initiatives` and `/performance` URLs redirect to the new pages.
- `app/(delaro)/` — internal Delaro routes, opportunity pipeline, actions, and internal initiative views.
- `app/(auth)/` — login and demo entry experience.
- `components/` — dashboard, navigation, operations, activity, improvements, impact, decisions, files, check-ins, and opportunity UI.
- `lib/domain.ts` — shared domain types and demo data.
- `lib/data/` — demo fallbacks and Supabase-backed data access functions.
- `lib/operational-model/` — typed people/process/system/data/decision/outcome model.
- `lib/decisions/` — client decision types and clearly labeled demo examples.
- `lib/operational-events/` — client-safe activity types and labeled Northstar examples.
- `lib/supabase/` — browser and server Supabase clients.
- `lib/auth/` — role and permission helpers.
- `lib/validation/` — input schemas.
- `supabase/migrations/` — ordered database foundation, tenant/RLS, operational model, measurement, economic-impact, approval, publication, and private-document migrations.
- `supabase/tests/pilot_rls.sql` — rollback-only multi-tenant/role integration assertions; run with a privileged test SQL connection.
- `docs/` — architecture notes.
- `outputs/delaro-client-demo.html` — self-contained offline client demo.

## Authentication

Only explicit development demo mode leaves routes open. With Supabase configured, middleware validates the user for each request and redirects unauthenticated requests to `/login`. The login form accepts a password or sends an invite-only email link. A user can request a password-reset email; the recovery callback exchanges its PKCE code and opens `/account` to set a new password. Sessions use Supabase SSR cookies. Sign-out clears the local session. Passwords are handled by Supabase Auth, not stored in the application database.

The server layout for `app/(delaro)/` checks the resolved membership role before rendering internal routes. Only `delaro_admin` and `delaro_consultant` can enter; other signed-in users are sent to `/overview`. The client Topbar shows **Open internal view** only for those roles. Internal server actions perform their own role and organization checks, including validation of referenced owners and opportunities.

## Supabase and database access

Server-side data access is implemented through `lib/supabase/server.ts`, `lib/auth/context.ts`, and the `lib/data/` loaders. `getCurrentUserContext()` resolves the authenticated Supabase user, profile, active memberships, validated active organization, and role on the server. A single active organization is selected automatically; for multi-organization users, the `delaro_active_organization` cookie is treated only as a preference and is accepted only when it matches an active membership. Server loaders and actions apply organization checks before querying or writing, while Supabase RLS remains the final enforcement layer. The data functions fall back to demo data only when Supabase is not configured. Apply the SQL files in `supabase/migrations/` to create the database foundation, organizations, memberships, opportunities, initiatives, and related policies.

## Client and tenant separation

The schema is organization-scoped: tenant-owned rows carry an `organization_id`, and Supabase queries filter by the organization resolved from the authenticated user. RLS and tenant-composite relationships are the final boundary; server actions add role and reference checks. Draft initiatives, internal scope, private diagnostics, and unpublished evidence are not client-readable. Demo mode uses Northstar Manufacturing and local browser storage only when explicitly enabled in development. Production organization switching UI is not yet exposed, but the server context supports multiple active memberships.

Client files use a private `client-documents` Storage bucket and `client_documents` metadata with tenant-aware RLS. Uploads are limited to PDF, PNG, JPEG, DOCX, or XLSX under 10 MB. Downloads are short-lived signed URLs after server-side membership and publication checks. The bucket and policies are created by the migration; no public file URL is used.

## Known unfinished areas

- A Delaro admin user and organization exist in the connected project, but no real client organization, client login, file, metric, or verified result has yet been exercised through the deployed browser workflow. Use [the pilot runbook](docs/pilot-runbook.md) before inviting a client.
- Supabase Auth's leaked-password protection is disabled in the connected project's advisor report and must be enabled in the Dashboard before launch.
- Auth recovery, email deliverability, and sign-out persistence still need real-browser acceptance testing with a test account. The code path and unit checks do not prove SMTP delivery.
- Uploaded documents have type/size restrictions and private access, but no malware scanning, DLP, retention schedule, or automated orphan-object cleanup yet. Do not use for sensitive regulated files until those policies are agreed.
- Internal authoring covers core process/step/system/constraint/opportunity/improvement records and measurement/value submissions. Advanced dependencies, handoffs, and structured onboarding still require deliberate manual database/Dashboard procedures.
- The Northstar demo and offline HTML export remain illustrative only. No production result is auto-populated from demo data.
- See [production-readiness](docs/production-readiness.md) for tested controls and remaining release blockers.
