# Operational model data layer

Migrations: `supabase/migrations/20261008232258_20261007224824_operational_model.sql` and `supabase/migrations/20261008232304_20261007230108_operations_client_publication.sql`. Apply the earlier migrations first. The client Operations map now reads published data; the authoring UI is not yet built.

## Relationships

```text
organizations
├── operational_areas ──< processes ──< process_steps
├── operational_teams ──< operational_team_members >── organization_memberships
│                       └── owner of processes / steps
├── operational_people ──> organization_memberships (approved display names)
├── systems ──< process_systems >── processes
│           └──< process_step_systems >── process_steps
├── data_assets ──< process_step_data >── process_steps
├── handoffs ──> source/destination process_steps and/or operational_teams
├── process_dependencies ──> upstream/downstream processes
├── step_dependencies ──> upstream/downstream process_steps
├── process_constraints ──> process and/or step and/or system
│   ├── constraint_diagnostics ──> internal opportunities (optional)
│   └── constraint_publications ──> client opportunity summaries and initiatives (optional)
└── process_metrics ──> process and optionally step
```

Every new table has `organization_id`. Composite foreign keys pair it with referenced IDs so an organization cannot link to another tenant's area, process, step, team, system, data asset, constraint, or opportunity. RLS still applies to every query.

## Representing a flow

One process stores its trigger, expected output, and downstream effect. Ordered steps (`sort_order`) represent input, process, decision, action, and output stages. A decision step can store criteria and approval requirements; `step_dependencies` captures branches and prerequisites rather than assuming a single linear sequence. Steps can name a member or team owner, linked systems, and input/output data assets. Handoffs capture what crosses between steps or teams, with method, delay, and failure rate. Constraints describe friction; internal diagnostics hold root cause, business consequence, and an optional opportunity link. Process metrics record baselines, targets, actuals, and measurement time as outcomes.

This connects the Delaro chain: people (members/teams) → processes/steps → systems → data assets → decisions/actions → measured outcomes.

## Security and loader contract

- Delaro administrators and consultants can author all operational-model tables for organizations where they hold that role. This also narrows authoring of the pre-existing `operational_areas` table to internal Delaro roles.
- Active client members can read operational areas (as allowed by the pre-existing policy) and only explicitly published (`client_visible`) new records. Steps, metrics, data assets, and constraints additionally require their related parent records to be published. Link tables, team membership details, handoffs, dependencies, and `constraint_diagnostics` remain internal-only pending a deliberate publication design.
- `process_constraints` contains client-safe issue, severity, frequency, and status fields. `constraint_diagnostics` is a separate one-to-one table for internal root cause, business consequence, opportunity linkage, and notes; a client query cannot expose these by selecting more columns. `constraint_publications` carries deliberately approved summaries, measured delay, and links to a client opportunity summary or improvement.
- Relationship rows (systems, step data, handoffs, dependencies) have their own `client_visible` flag and require visible endpoints. The client map does not expose an unpublished system or step through a published link.
- `operational_people` stores an opt-in display name and title for active membership owners. The client loader never reads another member's profile or email to construct a name.
- `getClientOperationalModel()` and `getInternalOperationalModel()` in `lib/data/operational-model.ts` resolve the authenticated user's active organization server-side. They accept no organization ID from the browser. The internal loader additionally checks the Delaro role. Both use explicit projections and apply an organization filter; RLS is the final security layer.
- When Supabase is not configured, the loaders return an empty model and do not interfere with existing demo routes or local-storage behavior.

## Assumptions and future work

- A process belongs to one operational area; a step belongs to one process. Cross-process relationships are explicit dependencies or handoffs.
- An owner is an organization membership or team, not arbitrary text. Membership foreign keys enforce tenant identity but not active status at assignment time; future authoring actions must validate that chosen owners are active.
- Duration and handoff delay use minutes. Failure rate uses a 0–100 percentage. Metrics use numeric values with a unit label and optional observation timestamp.
- `client_visible` defaults to false. Publishing should be a deliberate action after review; no bulk auto-publication occurs.
- No operational-model write actions or authoring UI are included yet. The Northstar client map is a local demo fixture; it is not seeded into Supabase.
