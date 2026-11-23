-- Stage 3 ingestion is service-to-service telemetry, not a human lifecycle
-- edit. Permit only the five derived monitoring fields to bypass internal-user
-- attribution when the caller's verified Supabase role is service_role.

create or replace function private.stage2_guard_implementation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  allowed boolean := false;
  deployment_date date;
  telemetry_fields text[] := array[
    'monitoring_status','operational_health','last_observed_status',
    'last_observed_at','updated_at'
  ];
begin
  if tg_op = 'UPDATE'
     and (select auth.role()) = 'service_role'
     and (to_jsonb(new) - telemetry_fields) = (to_jsonb(old) - telemetry_fields) then
    new.updated_by_membership_id := old.updated_by_membership_id;
    return new;
  end if;

  actor := private.stage2_internal_actor(new.organization_id);
  if tg_op = 'INSERT' then
    new.created_by_membership_id := actor;
    new.updated_by_membership_id := actor;
  else
    if (new.organization_id,new.initiative_id,new.created_by_membership_id) is distinct from
       (old.organization_id,old.initiative_id,old.created_by_membership_id) then
      raise exception 'Implementation ownership is immutable';
    end if;
    new.updated_by_membership_id := actor;
    if new.status is distinct from old.status then
      allowed := case old.status
        when 'planning' then new.status in ('architecture','paused','retired')
        when 'architecture' then new.status in ('development','paused','retired')
        when 'development' then new.status in ('internal_testing','paused')
        when 'internal_testing' then new.status in ('development','client_acceptance','paused')
        when 'client_acceptance' then new.status in ('development','internal_testing','ready_for_deployment','paused')
        when 'ready_for_deployment' then new.status in ('client_acceptance','deployed','paused')
        when 'deployed' then new.status in ('monitoring','paused','retired')
        when 'monitoring' then new.status in ('paused','retired')
        when 'paused' then new.status = old.status_before_pause or new.status = 'retired'
        else false
      end;
      if not allowed then raise exception 'Invalid implementation lifecycle transition'; end if;
      if new.status = 'paused' then new.status_before_pause := old.status;
      elsif old.status = 'paused' then new.status_before_pause := null;
      end if;
    end if;
  end if;

  if new.status in ('development','internal_testing','client_acceptance','ready_for_deployment','deployed','monitoring')
     and not private.stage2_initiative_is_approved(new.organization_id,new.initiative_id) then
    raise exception 'Approved parent improvement required before implementation work';
  end if;
  if new.status in ('ready_for_deployment','deployed','monitoring')
     and not private.stage2_implementation_is_ready(new.organization_id,new.id) then
    raise exception 'Required tests, acceptance criteria, and client acceptance must pass before deployment readiness';
  end if;
  if new.status in ('deployed','monitoring') then
    select deployed_at::date into deployment_date
    from public.implementation_deployments
    where organization_id = new.organization_id
      and implementation_id = new.id
      and acceptance_status = 'approved'
    order by deployed_at desc limit 1;
    if deployment_date is null then raise exception 'An approved deployment record is required'; end if;
    new.actual_deployment_date := deployment_date;
  end if;
  if new.status = 'monitoring'
     and (new.operational_owner_membership_id is null or nullif(trim(coalesce(new.support_responsibility,'')), '') is null) then
    raise exception 'Monitoring requires an operational owner and support responsibility';
  end if;
  return new;
end $$;
revoke all on function private.stage2_guard_implementation() from public, anon, authenticated;
