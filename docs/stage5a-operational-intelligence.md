# Stage 5A operational intelligence

Updated 27 November 2026.

## Purpose

Stage 5A adds a deterministic operational-intelligence layer over Delaro's existing workflow telemetry, verified metric observations, and measurement-source health. Its responsibility is deliberately narrow:

`Observe → Compare → Detect → Explain → Prioritize attention`

Detection does not diagnose root cause, recommend an intervention, create an opportunity, or change a client system. Those remain reviewed human decisions.

## Architecture

- `operational_signal_rules` stores organization-scoped, bounded detection rules.
- `operational_signals` stores the current deduplicated signal state and client-safe evidence summary.
- `operational_signal_internal_details` stores private investigation notes separately from client-visible records.
- `operational_signal_events` is the append-only lifecycle and publication audit history.
- `operational_signal_evaluations` records each evaluation outcome, including normal, insufficient-data, stale-source, detected, monitoring, and resolved results.
- `system_events` receives one plain-language lifecycle event for meaningful signal changes so existing activity views remain the operational ledger.

Every tenant-owned relationship carries `organization_id`. Composite relationships, row-level security, explicit grants, application authorization, and database guards provide layered tenant isolation.

## Detection methods

The evaluator uses deterministic methods only:

- metric deterioration against a compatible rolling reference median;
- explicit target breaches, kept distinct from rolling anomalies;
- workflow failure-rate changes across compatible terminal execution windows;
- workflow-duration changes using successful execution medians;
- source-health degradation based on authenticated source state and freshness.

Median, median absolute deviation, and interquartile range reduce sensitivity to isolated extremes. Each rule also has minimum current/reference sample sizes, bounded current/reference windows, persistence requirements, severity thresholds, and source-freshness checks. Incompatible units or time bases, stale business sources, and inadequate samples produce an evaluation record but never an anomaly.

## Lifecycle and deduplication

Signal identity is deterministic for organization, rule, entity, and signal type. Repeated evaluations update the same signal rather than creating duplicate alerts. Recovery uses hysteresis: a signal first moves to monitoring and resolves only after the configured recovery evidence persists. A later breach reopens the same identity with a new lifecycle event.

Evaluation runs after accepted workflow telemetry and metric-observation ingestion, and after the existing scheduled measurement-source synchronization. Work is bounded to avoid unbounded history scans. Telemetry ingestion remains successful if the advisory evaluator encounters an error.

## Visibility and human review

Business-performance signals default to internal-only or review-required publication. An authorized Delaro user must review and publish the client-safe summary. Automatic client publication is permitted only for high-confidence infrastructure source-health signals; a PostgreSQL guard enforces that restriction independently of application code.

Clients receive plain-language evidence, operational relationships, and lifecycle history. Internal notes, rule mechanics, and evaluator diagnostics remain on internal-only tables and routes.

## Economic context

Economic context is associative, not causal. A signal can show related value models only when the model is active, client-visible, and aggregation-approved. Each model remains separate, and only its latest client-visible, verified, realized annualized snapshot is shown. The signal never sums overlapping benefit streams and never converts a detected change into an asserted loss or ROI.

If no verified realized snapshot exists, the interface states `Verified value pending`.

## Test Email Agent acceptance

The live `Test Email Agent` history was read on 27 November 2026 without mutating production data:

- current 24-hour terminal sample count: 2;
- preceding 30-day terminal sample count: 25;
- current failures: 0;
- reference failures: 2;
- duration medians: unavailable in both windows;
- latest execution observed: 27 November 2026 at 16:15:42 UTC.

The default workflow rule requires at least five current samples. The live evaluator therefore persisted `insufficient_data` with reason `minimum_samples`; no signal was fabricated. At verification time the production database held eight rules, 15 evaluation records, and zero signals. Future authenticated events and scheduled evaluations will reassess the rules as evidence accumulates.

## Stage 5B recommendation

Stage 5B should allow a reviewed, persistent signal to be linked to an existing constraint or promoted through a human-reviewed constraint/opportunity workflow. It should not create constraints, opportunities, financial claims, or remediation actions automatically.

## Known limitations

- Daily scheduling on the current Vercel plan is not suitable for near-real-time pull-source anomaly detection. Event-triggered workflow and observation evaluation remains immediate.
- A live production signal cannot be accepted until a real dataset crosses the configured sample and persistence thresholds.
- Rules are deterministic and intentionally narrow; seasonality, multi-variable attribution, and causal inference are not part of Stage 5A.
- Operational signal corrections are represented by lifecycle events rather than editing prior audit events.
