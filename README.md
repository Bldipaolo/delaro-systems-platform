# Delaro Systems Platform

Delaro Systems is a client platform for making improvement work easy to follow: clients can see what is changing, the projects underway, the results being tracked, shared files, and the next check-in. The repository also includes an internal Delaro workspace for managing opportunities and client work.

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

- `app/(portal)/` — client workspace routes: Home, Projects, Results, Files, and Check-ins.
- `app/(delaro)/` — internal Delaro routes, opportunity pipeline, actions, and internal project views.
- `app/(auth)/` — login and demo entry experience.
- `components/` — dashboard, navigation, projects, files, results, check-ins, and opportunity UI.
- `lib/domain.ts` — shared domain types and demo data.
- `lib/data/` — demo fallbacks and Supabase-backed data access functions.
- `lib/supabase/` — browser and server Supabase clients.
- `lib/auth/` — role and permission helpers.
- `lib/validation/` — input schemas.
- `supabase/migrations/` — database foundation and opportunities/initiatives schema.
- `docs/` — architecture notes.
- `outputs/delaro-client-demo.html` — self-contained offline client demo.

## Authentication

With no Supabase environment variables, middleware leaves routes accessible and `/login` offers the demo workspace. When Supabase variables are configured, middleware uses the Supabase SSR client to read the authenticated user and redirects unauthenticated requests to `/login`. The login form uses Supabase password authentication.

## Supabase and database access

Server-side data access is implemented through `lib/supabase/server.ts` and currently covers opportunities and initiatives. The data functions fall back to demo data when Supabase is not configured. Server actions validate input with Zod before inserting records. Apply the SQL files in `supabase/migrations/` to create the database foundation, organizations, memberships, opportunities, initiatives, and related policies.

## Client and tenant separation

The schema is organization-scoped: opportunities and initiatives carry an `organization_id`, and Supabase queries filter by that organization. Membership and role tables plus row-level security policies are included in the migrations. The current demo UI uses the Northstar Manufacturing workspace and local browser storage; organization selection and production membership resolution are not fully wired yet.

## Known unfinished areas

- Supabase project configuration, production authentication, and live persistence are not connected in the demo environment.
- File uploads/storage, comments, notifications, and real KPI evidence are not implemented.
- Some internal navigation and server actions are scaffolding for the next backend phase.
- The offline HTML export is a presentation/demo artifact separate from the Next.js application.
