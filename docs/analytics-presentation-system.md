# Analytics presentation system

## Stage 1: client Impact

The first stage establishes a reusable, evidence-first analytics layer and applies it to the client Impact page. Internal analytics pages remain unchanged until this representative implementation is approved.

## Shared components

- `EvidenceState`: pending, submitted, verified, and rejected evidence semantics.
- `ExecutiveKpiSummary`: comparable executive measures with state and explanatory context.
- `TimeSeriesChart`: verified and submitted history, reference lines, truthful empty states, and a screen-reader table.
- `FinancialBreakdownChart`: theoretical, recoverable, and expected annual value by improvement.
- `MetricComparisonTable`: selectable baseline, target, latest-verified, evidence, and last-measured comparison.
- `AnalyticsDetailPanel`: consistent inspection surface for measurement and financial records.
- Shared formatting and series helpers centralize currency, percentages, dates, units, workflow precedence, and cumulative realized-value construction.

## Presentation rules

- Lead with verified outcomes. Estimates and assumptions remain subordinate.
- Never present submitted observations as verified results.
- Keep theoretical, recoverable, expected annual, and cumulative realized values distinct.
- State is communicated with text and structure, not color alone.
- Illustrative data is labeled explicitly and never treated as production evidence.
- Empty charts explain what evidence is missing instead of fabricating a trend.
- Charts retain accessible tabular alternatives; mobile metric tables retain semantic headers.

## Data-integrity rules

- A client actual requires a verified observation and verified, client-visible evidence.
- Submitted observations are available to internal reviewers only and cannot replace the latest verified result.
- Executive aggregation accepts only valid, approved models with unique benefit streams and a single shared currency.
- Duplicate benefit streams or mixed currencies withhold the aggregate and its time series.
- A stage total is withheld if any eligible model lacks the inputs required for that stage.
- Realized value includes only evidence-backed, arithmetic-consistent, non-overlapping periods.
- Annualized run rates remain audit metadata and are never added to cumulative realized value.
- Evidence URLs continue through the credential-free HTTPS safety filter.

## Verification

- TypeScript check: passed.
- Test suite: 20 tests passed.
- Production build: passed with the configured Supabase environment.
- Responsive review: completed at 1440 × 1000 and 390 × 844.
- Browser console: no application errors; the only warning observed was development-only Fast Refresh after source synchronization.
- Impeccable detector: no findings.

## Intentionally deferred

- Propagation to internal Measurement, Business Cases, and Value Realization pages.
- New authoring, approval, or correction workflows.
- New database schema or migrations.
- Advanced chart controls such as zooming, filtering, or configurable series.
- Broader shell, navigation, or non-Impact redesign.
