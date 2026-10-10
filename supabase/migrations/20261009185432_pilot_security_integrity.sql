-- Pilot integrity: the database, not a browser payload, attributes reviews.
-- Verified source material and measurements are append-only. Corrections must
-- be new evidence/observations and explicitly reviewed.

create function private.pilot_internal_reviewer(target_org uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare reviewer uuid;
begin
  select id into reviewer from public.organization_memberships
  where organization_id = target_org and user_id = (select auth.uid())
    and status = 'active' and role in ('delaro_admin','delaro_consultant');
  if reviewer is null then raise exception 'Active internal reviewer required'; end if;
  return reviewer;
end $$;
revoke all on function private.pilot_internal_reviewer(uuid) from public, anon, authenticated;

create function private.pilot_guard_evidence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.verification_status = 'verified' then
    raise exception 'Verified evidence is immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and new.verification_status = 'verified' then
    raise exception 'Submit evidence before review';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Evidence organization is immutable';
  end if;
  if new.verification_status = 'verified' then
    if nullif(trim(coalesce(new.source_reference,'')), '') is null
      and nullif(trim(coalesce(new.document_url,'')), '') is null then
      raise exception 'Verified evidence requires an identifiable source';
    end if;
    new.verified_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    new.verified_at := now();
  else
    new.verified_by_membership_id := null;
    new.verified_at := null;
  end if;
  return new;
end $$;
revoke all on function private.pilot_guard_evidence() from public, anon, authenticated;
create trigger pilot_measurement_evidence_guard before insert or update or delete on public.measurement_evidence
  for each row execute function private.pilot_guard_evidence();
create trigger pilot_value_evidence_guard before insert or update or delete on public.value_evidence
  for each row execute function private.pilot_guard_evidence();

create function private.pilot_guard_measurement() returns trigger
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
    if tg_table_name = 'metric_observations' and new.measured_at > now() then
      raise exception 'Future observation cannot be verified';
    end if;
    new.verified_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    new.verified_at := now();
  else
    new.verified_by_membership_id := null;
    new.verified_at := null;
  end if;
  return new;
end $$;
revoke all on function private.pilot_guard_measurement() from public, anon, authenticated;
create trigger pilot_baseline_guard before insert or update or delete on public.metric_baselines
  for each row execute function private.pilot_guard_measurement();
create trigger pilot_observation_guard before insert or update or delete on public.metric_observations
  for each row execute function private.pilot_guard_measurement();

create function private.pilot_guard_value_realization() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and new.verification_status = 'verified' then
    raise exception 'Submit realized value before review';
  end if;
  if tg_op = 'UPDATE' and (new.organization_id,new.model_id) is distinct from
    (old.organization_id,old.model_id) then
    raise exception 'Value model ownership is immutable';
  end if;
  if new.verification_status = 'verified' then
    new.verified_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
    new.verified_at := now();
  else
    new.verified_by_membership_id := null;
    new.verified_at := null;
  end if;
  return new;
end $$;
revoke all on function private.pilot_guard_value_realization() from public, anon, authenticated;
create trigger pilot_value_realization_guard before insert or update on public.value_realization_snapshots
  for each row execute function private.pilot_guard_value_realization();

-- Approval requests are human client decisions, not an internal shortcut.
-- An answered request cannot be silently reopened and rewritten.
create function private.pilot_guard_approval_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then raise exception 'Answered approvals are immutable'; end if;
    return new;
  end if;
  if not exists (select 1 from public.organization_memberships m
    where m.id = new.requested_from_membership_id and m.organization_id = new.organization_id
      and m.status = 'active' and m.role in ('client_admin','client_user')) then
    raise exception 'Approval must be assigned to an active client member';
  end if;
  return new;
end $$;
revoke all on function private.pilot_guard_approval_assignment() from public, anon, authenticated;
create trigger pilot_approval_assignment_guard before insert or update on public.approvals
  for each row execute function private.pilot_guard_approval_assignment();
