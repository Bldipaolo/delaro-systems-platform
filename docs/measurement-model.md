# Measurement architecture

Apply `supabase/migrations/20261008232306_20261007231420_client_improvement_narratives.sql` and `supabase/migrations/20261008232308_20261007231423_measurement_architecture.sql` after the operational-model migrations. The migrations add no demo or actual-result rows.

```text
initiatives ──< measurement_metrics >── processes / process_steps
    │                    ├── metric_baselines ──> measurement_evidence
    │                    ├── metric_targets
    │                    └── metric_observations ──> measurement_evidence
    └── initiative_client_narratives
```

`measurement_metrics` defines the unit, direction, source system, method, cadence, owner, and client visibility. A baseline and target are separate records. The current value is **derived** from the latest verified observation; it is never auto-filled from a target or from the older `process_metrics` table. Each observation records its period, timestamp, source, contributor, evidence, and verification state. Evidence records may reference a source document or attachment and have their own verification state.

Every table is tenant-scoped with `organization_id`, composite tenant foreign keys, RLS, and authenticated grants. Delaro administrators and consultants manage measurement data. Clients read published metrics and targets, but baselines and observations are readable only when both the record and its client-visible evidence are verified. Pending or rejected observations are not reported as actual results. The client loader checks this again before constructing Impact data.

`initiative_client_narratives` holds approved intervention, implementation, expected-result, current-state, and measurement-plan summaries. The Improvements loader only displays initiatives with a client-visible narrative and combines those with published operational constraints and metrics. It never reads internal opportunity scores or `initiative_internal_details`.

The Northstar values are local, explicitly labeled demo estimates. Their actual values are null. This pass includes read-only client views, not measurement entry or verification actions; those require a separate authorized internal workflow. Existing `process_metrics` remains for operational mapping and is not migrated into the evidence-led measurement model automatically.
