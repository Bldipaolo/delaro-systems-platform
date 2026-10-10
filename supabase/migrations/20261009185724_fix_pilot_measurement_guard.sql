-- PL/pgSQL record fields are evaluated even when a boolean branch is false.
-- Keep observation-only columns in a nested table-specific branch.
create or replace function private.pilot_guard_measurement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_ok boolean;
begin
  if tg_op in ('UPDATE','DELETE') and old.verification_status = 'verified' then
    raise exception 'Verified measurement is immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and new.verification_status = 'verified' then
    raise exception 'Submit measurement before review';
  end if;
  if tg_op = 'UPDATE' and (new.organization_id,new.metric_id) is distinct from
    (old.organization_id,old.metric_id) then
    raise exception 'Measurement ownership is immutable';
  end if;
  if new.verification_status = 'verified' then
    select exists(select 1 from public.measurement_evidence e
      where e.organization_id = new.organization_id and e.metric_id = new.metric_id
        and e.id = new.evidence_id and e.verification_status = 'verified'
        and e.client_visible) into source_ok;
    if not source_ok then raise exception 'Verified measurement requires verified published evidence'; end if;
    if new.period_end > current_date then raise exception 'Future measurement period cannot be verified'; end if;
    if tg_table_name = 'metric_observations' then
      if new.measured_at > now() then raise exception 'Future observation cannot be verified'; end if;
    end if;
    new.verified_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    new.verified_at := now();
  else
    new.verified_by_membership_id := null;
    new.verified_at := null;
  end if;
  return new;
end $$;
