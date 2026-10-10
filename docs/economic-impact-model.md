# Economic impact and audit model

Apply `supabase/migrations/20261008232314_20261008001253_economic_impact_models.sql` after the measurement migration. It creates no production amounts or demo rows.

```text
initiative / opportunity ──< value_models >── measurement_metrics (optional)
                              ├── value_model_inputs ──> value_evidence (optional)
                              ├── value_evidence
                              └── value_realization_snapshots ──> value_evidence (required to verify)
```

Each model has a category, currency, annualization basis, named calculation method, confidence and its rationale, and a unique benefit-stream key. The supported methods are a product of factors or a positive/negative baseline-to-target change multiplied by factors. Inputs keep their value, unit, provenance (`known`, `client_assumption`, `delaro_assumption`), source description, and optional evidence. No free-form formula is executed.

The four value states are separate:

1. **Theoretical maximum (Estimated):** calculated annual value from the published factors. This is a ceiling, not a forecast.
2. **Realistically recoverable (Estimated):** theoretical maximum × explicitly entered recoverable percentage. Null until that percentage is recorded.
3. **Expected annual value (Expected):** recoverable value × explicitly entered expected capture percentage. Null until both percentages are recorded.
4. **Verified realized value (Verified):** the sum of non-overlapping, dated realization snapshots. Each snapshot stores realized units and unit value; PostgreSQL generates the period value. Verification requires a reviewer, timestamp, and verified client-visible evidence. Pending or rejected evidence yields no actual value. Verified evidence and snapshots are immutable; corrections require new records.

An optional snapshot annualization factor generates a **run-rate projection**. It is shown separately and never added to realized value. A verified one-month sample does not become twelve months of realized benefit.

The executive summary includes only published, arithmetically valid, same-currency models explicitly approved by a Delaro reviewer for aggregation. Unique benefit-stream keys help prevent duplicate streams; the reviewer still has to inspect overlap between distinct streams. Incomplete models, unapproved models, and mixed currencies remain visible in their own audit detail but are excluded from the total. The client can inspect the factors, assumptions, formula, source descriptions, evidence state, and verified periods by selecting a value. No ROI ratio is calculated because implementation costs and counterfactual attribution are not validated here.

All tables have `organization_id`, composite tenant foreign keys, RLS, authenticated grants, and internal-only writes. Publication freezes a complete client-readable input set; it must be withdrawn before factors change. Clients see only active published models and their client-visible inputs/evidence, plus verified snapshots backed by verified evidence. The server loader rechecks publication and evidence before calculating totals. There is no client-side actual-entry or verification action.

The Northstar demo uses the brief's example factors—1.82 hours/order × 440 orders/year × $52/hour = $41,641.60—as a clearly marked *illustrative theoretical maximum*. Recoverable, expected, and realized values remain pending. These are not claims about Northstar or measured ROI.
