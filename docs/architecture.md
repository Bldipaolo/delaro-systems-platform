# Delaro Systems platform foundation

This repository starts the Delaro client platform from an empty workspace.

## Current slice

- Next.js App Router with strict TypeScript
- Delaro client portal shell and responsive navigation
- Executive client overview with explicit demo data
- Demo-mode login boundary when Supabase is not configured
- Supabase browser/server clients and session middleware
- Central AI task routing seam with explicit model tiers (no provider calls yet)
- Initial tenant schema for profiles, organizations, memberships, and operational areas
- RLS helper functions and starter policies
- Central domain types and permission helpers

## Design decisions

- Client data is intentionally executive-level. Internal opportunity scoring, private notes, pricing, and pipeline data are not part of the client surface.
- Value fields show `—` until measured evidence exists; the UI does not invent ROI.
- Demo content is clearly labelled as a demo workspace.
- All future tenant-owned tables must include `organization_id` and RLS policies.
- Opportunity scoring and KPI/value calculations belong in deterministic server-side modules.
- AI should be introduced behind a task-routing abstraction after the core operating data model exists.

## Next build slice

Opportunity and initiative persistence now has its initial schema, loaders, and server-action write boundary. The next slice is to connect a real organization context and add role-isolation tests before adding KPI/value workflows.
