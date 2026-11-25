-- Safe, named calculation primitives only. No formula text is executed.
alter table public.value_models drop constraint value_models_formula_kind_check;
alter table public.value_models add constraint value_models_formula_kind_check
  check (formula_kind in ('product','positive_delta_product','negative_delta_product','minutes_to_hours_product'));

create or replace function public.guard_value_model_publication() returns trigger language plpgsql
set search_path = '' as $$
declare factor_count integer; baseline_count integer; target_count integer;
begin
  if new.client_visible and new.status = 'active' then
    select count(*) filter (where role = 'factor'), count(*) filter (where role = 'baseline'),
      count(*) filter (where role = 'target')
    into factor_count, baseline_count, target_count
    from public.value_model_inputs where organization_id = new.organization_id and model_id = new.id;
    if (new.formula_kind in ('product','minutes_to_hours_product') and (factor_count < 2 or baseline_count <> 0 or target_count <> 0))
      or (new.formula_kind not in ('product','minutes_to_hours_product') and (factor_count < 1 or baseline_count <> 1 or target_count <> 1))
      or exists (
        select 1 from public.value_model_inputs i
        where i.organization_id = new.organization_id and i.model_id = new.id
          and (
            not i.client_visible
            or (i.evidence_id is not null and not exists (
              select 1 from public.value_evidence e where e.organization_id = i.organization_id
                and e.model_id = i.model_id and e.id = i.evidence_id and e.client_visible
            ))
            or (i.metric_id is not null and not exists (
              select 1 from public.measurement_metrics mm where mm.organization_id = i.organization_id
                and mm.id = i.metric_id and mm.client_visible
            ))
          )
      ) then
      raise exception 'Publish only complete models with client-visible inputs and linked evidence';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_value_model_publication() from public, anon, authenticated;
