# Stage 4B — economic impact and value realization

Stage 4B extends the existing Stage 4A measurement chain. It does not create a second measurement system.

```text
Workflow → Metric → Baseline → Observation → Measured improvement
                                          ↓
                         Economic model → Estimate
                                          ↓
                    Observed → Realized → Verified value
```

## Data model

- `value_models` retains the model definition, economic mechanism, horizon, attribution, publication state, confidence, and aggregation approval. A model may be anchored to an improvement, opportunity, or independently registered monitored workflow.
- `value_model_inputs` supports either a documented manual value or a reference to a Stage 4A metric derivation. Derived values are resolved at read time; the metric value is not copied into the economic input.
- `value_model_metric_links` and `value_model_workflows` connect a model to multiple measures and workflows.
- `value_model_costs` records implementation and recurring costs with currency, cadence, provenance, evidence, and verification state.
- `value_realization_snapshots` distinguishes observed economic consequences from realized financial outcomes. Verification remains a separate state and still requires verified evidence.
- `value_model_validations` records client approval or dispute of published assumptions without allowing the client to modify the model.

Every new table is organization-scoped, uses composite tenant foreign keys, has RLS enabled, and grants client reads only through explicit publication rules. Internal Delaro roles retain the editing boundary.

## Calculation model

No arbitrary formula code is executed. Supported named primitives are:

- product of documented factors;
- baseline-to-target positive delta × factors;
- baseline-to-target negative delta × factors;
- minutes × factors ÷ 60, for transparent labor-capacity conversion.

Attribution, recoverability, and expected capture are applied as explicit percentages with visible rationale. Financial arithmetic is rounded through integer cents. Mixed currencies, duplicate benefit streams, missing factors, overlapping verified periods, and incomplete cost data cause totals or ROI to be withheld.

Modeled ROI and payback are planning comparisons only. They require supported benefit and cost inputs and never create a realized or verified result.

## Trust states

- **Estimated / modeled:** deterministic result from measured values and documented assumptions.
- **Observed:** evidence indicates an economic consequence, but authoritative reconciliation is incomplete.
- **Realized:** a spending, revenue, staffing, capacity-allocation, or other economic outcome was recorded.
- **Verified:** the realized period and its supporting evidence have both passed review.

Capacity released is not presented as cash savings. Avoided hiring remains avoided cost. Annualized run rate remains a projection and is excluded from cumulative verified value.

## Migrations

- `20261125203700_stage4b_economic_impact_value_realization.sql`
- `20261125205149_stage4b_value_model_indexes.sql`
- `20261125205228_stage4b_safe_formula_methods.sql`
- `20261125205958_stage4b_workflow_native_models.sql`

## Verification

`supabase/tests/stage4b_economic_impact.sql` runs tenant isolation, publication, cost visibility, and assigned-client validation checks inside a rolled-back transaction. `tests/economic-impact.test.mjs` covers deterministic calculation, attribution, costs, ROI, payback, trust-state separation, stale inputs, and the named minutes-to-hours conversion.

The live Test Email Agent acceptance record is named **Synthetic acceptance test — Email handling capacity**. Its four explicitly synthetic inputs produce $200/month of modeled capacity value ($2,400 annualized). It has no observed, realized, or verified value and is not approved for organization-level aggregation, so it cannot inflate executive reporting.

The production advisor still reports two pre-existing security warnings: the intentionally exposed, authorization-checking `get_client_workflow_monitoring` security-definer RPC and disabled leaked-password protection. Stage 4B introduced no new security-advisor warning.
