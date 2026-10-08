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

Open `http://localhost:3000`. The app runs in demo mode when Supabase variables are absent; demo edits persist in browser local storage.

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Only the browser-safe Supabase URL and anonymous key belong in this file. No service-role key, password, access token, or production credential should be committed.

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
- `supabase/migrations/` — database foundation, opportunities/initiatives, operational model, client narratives, evidence-led measurement, and economic-impact schema.
- `docs/` — architecture notes.
- `outputs/delaro-client-demo.html` — self-contained offline client demo.

## Authentication

With no Supabase environment variables, middleware leaves routes accessible and `/login` offers the demo workspace. When Supabase variables are configured, middleware uses the Supabase SSR client to read the authenticated user and redirects unauthenticated requests to `/login`. The login form uses Supabase password authentication.

The server layout for `app/(delaro)/` checks the resolved membership role before rendering internal routes. Only `delaro_admin` and `delaro_consultant` can enter; other signed-in users are sent to `/overview`. The client Topbar shows **Open internal view** only for those roles. Internal server actions perform their own role and organization checks, including validation of referenced owners and opportunities. Demo mode remains open when Supabase is not configured.

## Supabase and database access

Server-side data access is implemented through `lib/supabase/server.ts`, `lib/auth/context.ts`, and the `lib/data/` loaders. `getCurrentUserContext()` resolves the authenticated Supabase user, profile, active memberships, validated active organization, and role on the server. A single active organization is selected automatically; for multi-organization users, the `delaro_active_organization` cookie is treated only as a preference and is accepted only when it matches an active membership. Server loaders and actions apply organization checks before querying or writing, while Supabase RLS remains the final enforcement layer. The data functions fall back to demo data only when Supabase is not configured. Apply the SQL files in `supabase/migrations/` to create the database foundation, organizations, memberships, opportunities, initiatives, and related policies.

## Client and tenant separation

The schema is organization-scoped: opportunities and initiatives carry an `organization_id`, and Supabase queries filter by the organization resolved from the authenticated user. Membership and role tables plus row-level security policies are included in the migrations. Demo mode still uses the Northstar Manufacturing workspace and local browser storage. Production organization switching UI is not yet exposed, but the server context supports multiple active memberships and validates any future organization selection.

## Known unfinished areas

- Supabase project configuration, production authentication, and live persistence are not connected in the demo environment.
- Apply `supabase/migrations/20261007223826_opportunity_scores_one_to_five.sql` to an existing database before accepting new 1–5 opportunity scores. It repairs legacy zero inputs and recalculates affected scores and priorities.
- File uploads/storage, notifications, and real KPI evidence are not implemented. Comments are available only on shared decisions.
- Some internal navigation and server actions are scaffolding for the next backend phase.
- Client Improvements and Impact are read-only. Internal authoring and evidence-verification actions still need to be built; no client can enter an actual result from the UI.
- The client Operations area reads published process maps and has a Northstar demo map. The authoring interface remains unfinished; production content must be mapped and explicitly published by Delaro. See `docs/operational-model.md` for relationships and publication rules.
- The evidence-led measurement model is documented in `docs/measurement-model.md`. The Northstar Impact values are demo estimates; actual results are intentionally blank until verified evidence exists.
- Economic value calculations and audit rules are documented in `docs/economic-impact-model.md`. The client ledger distinguishes theoretical, recoverable, expected, and verified realized value. Demo economic factors are illustrative; no verified value or ROI is asserted.
- Decisions are documented in `docs/decisions-model.md`. Production decisions require the new migration and published records. In demo mode, responses and comments are browser-cookie examples only; they do not authorize work or persist to a database.
- Operational activity is documented in `docs/operational-events.md`. The client sees published plain-language events and exceptions; technical metadata remains internal. The Northstar feed is illustrative. External event ingestion and notifications remain unfinished.
- The offline HTML export is a presentation/demo artifact separate from the Next.js application.
