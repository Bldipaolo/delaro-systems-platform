-- Attribute entry to the authenticated internal member, even for direct Data API writes.
alter table public.metric_baselines add column entered_by_membership_id uuid;
alter table public.metric_baselines add constraint metric_baselines_entered_by_tenant_fk
  foreign key (organization_id,entered_by_membership_id)
    references public.organization_memberships(organization_id,id) on delete restrict;
create index metric_baselines_entered_by_idx
  on public.metric_baselines (organization_id,entered_by_membership_id);

create function private.pilot_stamp_measurement_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'metric_baselines' then
    if tg_op = 'INSERT' then
      new.entered_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    elsif new.entered_by_membership_id is distinct from old.entered_by_membership_id then
      raise exception 'Baseline author is immutable';
    end if;
  else
    if tg_op = 'INSERT' then
      new.entered_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    elsif new.entered_by_membership_id is distinct from old.entered_by_membership_id then
      raise exception 'Observation author is immutable';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.pilot_stamp_measurement_entry() from public,anon,authenticated;
create trigger pilot_baseline_author before insert or update on public.metric_baselines
  for each row execute function private.pilot_stamp_measurement_entry();
create trigger pilot_observation_author before insert or update on public.metric_observations
  for each row execute function private.pilot_stamp_measurement_entry();

-- Executive aggregation approval is a deliberate, immutable attestation.
create function private.pilot_guard_approved_value_model() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.aggregation_approved_at is not null or new.aggregation_approved_by_membership_id is not null then
      raise exception 'Create the value model before approval';
    end if;
    return new;
  end if;
  if old.aggregation_approved_at is not null then
    if row(new.initiative_id,new.opportunity_id,new.metric_id,new.name,new.category,
      new.formula_kind,new.calculation_method,new.annualization_basis,new.currency_code,
      new.benefit_stream_key,new.recoverable_percentage,new.expected_capture_percentage,
      new.confidence,new.confidence_rationale,new.client_visible,new.status,
      new.aggregation_approved_at,new.aggregation_approved_by_membership_id)
      is distinct from
      row(old.initiative_id,old.opportunity_id,old.metric_id,old.name,old.category,
      old.formula_kind,old.calculation_method,old.annualization_basis,old.currency_code,
      old.benefit_stream_key,old.recoverable_percentage,old.expected_capture_percentage,
      old.confidence,old.confidence_rationale,old.client_visible,old.status,
      old.aggregation_approved_at,old.aggregation_approved_by_membership_id) then
      raise exception 'Approved value model is immutable; create a replacement model for corrections';
    end if;
  elsif new.aggregation_approved_at is not null or new.aggregation_approved_by_membership_id is not null then
    if not new.client_visible or new.status <> 'active' then
      raise exception 'Publish the value model before aggregation approval';
    end if;
    new.aggregation_approved_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    new.aggregation_approved_at := now();
  end if;
  return new;
end $$;
revoke all on function private.pilot_guard_approved_value_model() from public,anon,authenticated;
create trigger pilot_value_model_approval before insert or update on public.value_models
  for each row execute function private.pilot_guard_approved_value_model();
