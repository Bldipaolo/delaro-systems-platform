-- Repair legacy zero inputs before enforcing the Diagnostic Framework's 1–5 scale.
with fixed as (
  select id,
    greatest(financial_impact_score, 1) as financial_impact_score,
    greatest(frequency_score, 1) as frequency_score,
    greatest(addressability_score, 1) as addressability_score,
    greatest(measurement_quality_score, 1) as measurement_quality_score,
    greatest(strategic_leverage_score, 1) as strategic_leverage_score,
    greatest(implementation_difficulty_score, 1) as implementation_difficulty_score,
    greatest(organizational_complexity_score, 1) as organizational_complexity_score,
    greatest(risk_score, 1) as risk_score
  from public.opportunities
  where least(financial_impact_score, frequency_score, addressability_score,
    measurement_quality_score, strategic_leverage_score, implementation_difficulty_score,
    organizational_complexity_score, risk_score) = 0
), scored as (
  select *, financial_impact_score + frequency_score + addressability_score
    + measurement_quality_score + strategic_leverage_score
    - implementation_difficulty_score - organizational_complexity_score - risk_score
    as corrected_score
  from fixed
)
update public.opportunities as opportunity
set financial_impact_score = scored.financial_impact_score,
  frequency_score = scored.frequency_score,
  addressability_score = scored.addressability_score,
  measurement_quality_score = scored.measurement_quality_score,
  strategic_leverage_score = scored.strategic_leverage_score,
  implementation_difficulty_score = scored.implementation_difficulty_score,
  organizational_complexity_score = scored.organizational_complexity_score,
  risk_score = scored.risk_score,
  opportunity_score = scored.corrected_score,
  priority = case
    when scored.corrected_score >= 24 then 'Critical'::public.opportunity_priority
    when scored.corrected_score >= 16 then 'High'::public.opportunity_priority
    when scored.corrected_score >= 8 then 'Medium'::public.opportunity_priority
    else 'Low'::public.opportunity_priority
  end
from scored
where opportunity.id = scored.id;

alter table public.opportunities
  drop constraint opportunities_financial_impact_score_check,
  drop constraint opportunities_frequency_score_check,
  drop constraint opportunities_addressability_score_check,
  drop constraint opportunities_measurement_quality_score_check,
  drop constraint opportunities_strategic_leverage_score_check,
  drop constraint opportunities_implementation_difficulty_score_check,
  drop constraint opportunities_organizational_complexity_score_check,
  drop constraint opportunities_risk_score_check;

alter table public.opportunities
  add constraint opportunities_financial_impact_score_check check (financial_impact_score between 1 and 5),
  add constraint opportunities_frequency_score_check check (frequency_score between 1 and 5),
  add constraint opportunities_addressability_score_check check (addressability_score between 1 and 5),
  add constraint opportunities_measurement_quality_score_check check (measurement_quality_score between 1 and 5),
  add constraint opportunities_strategic_leverage_score_check check (strategic_leverage_score between 1 and 5),
  add constraint opportunities_implementation_difficulty_score_check check (implementation_difficulty_score between 1 and 5),
  add constraint opportunities_organizational_complexity_score_check check (organizational_complexity_score between 1 and 5),
  add constraint opportunities_risk_score_check check (risk_score between 1 and 5);
