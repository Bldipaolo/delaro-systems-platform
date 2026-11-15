# Analytics presentation system

## Stage 1: client Impact

The first stage established a reusable, evidence-first analytics layer and applied it to the client Impact page as the representative implementation.

## Stage 2: internal analytics

Stage 2 applies the same evidence-first system to internal Measurement, Business Cases, and Value Realization. The default information architecture now leads with portfolio position, performance or value history, and audit detail. Record creation, evidence submission, and verification controls remain in separate Measurement and Value workbenches below the analytical view so workflow activity does not compete with reported results.

- Measurement history may show submitted and verified observations together, but only the latest observation backed by both a verified record and verified evidence becomes the reported actual. A newer submission changes the workflow state to submitted without replacing the older verified result; baselines follow the same evidence requirement.
- Value Realization keeps submitted periods in the review queue. Its cumulative history includes only approved models and verified, evidence-backed, arithmetic-consistent, non-overlapping periods; annualized run rates remain audit metadata.
- Portfolio totals use valid, aggregation-approved models with unique benefit-stream keys and one shared currency. Duplicate streams, mixed currencies, overlapping verified periods, or an incomplete eligible model withhold the affected total and cumulative series instead of displaying a partial portfolio.
- Business Cases compares the USD-denominated opportunity implementation-cost field with approved expected annual value. Payback is `implementation cost ÷ expected annual value × 12`, rounded to one decimal, and is withheld for missing or invalid cost, missing or non-positive benefit, shared unallocated cost, an unapproved model, or a non-USD value model. It remains a modeled planning measure, not realized value.
- Time-series plots are keyboard-focusable when horizontally scrollable and expose a visible `View measurement data` disclosure with a semantic period, value, and status table.
- Automated coverage exercises submitted-versus-verified history, workflow precedence, cumulative-value completeness and currency guards, honest empty states, payback withholding, and responsive/accessibility contracts. The full suite passes 21 tests and TypeScript checking passes; the production build remains the route-integration release gate.

## Shared components

- `EvidenceState`: pending, submitted, verified, and rejected evidence semantics.
- `ExecutiveKpiSummary`: comparable executive measures with state and explanatory context.
- `TimeSeriesChart`: verified and submitted history, reference lines, truthful empty states, a keyboard-focusable mobile plot, and a visible semantic data table.
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
- Test suite: 21 tests passed.
- Production build: passed with the configured Supabase environment.
- Responsive review: completed at 1440 × 1000 and 390 × 844.
- Browser console: no application errors; the only warning observed was development-only Fast Refresh after source synchronization.
- Impeccable detector: no findings.

## Intentionally deferred

- New authoring, approval, or correction workflows.
- New database schema or migrations.
- Row-level security changes.
- Advanced chart controls such as zooming, filtering, or configurable series.
- Broader shell, navigation, or non-Impact redesign.
