-- Stage 1 hardening: keep provisioning atomic and make implementation approval
-- a database invariant, including writes made through the Data API.

create or replace function public.provision_client_organization(
  requested_organization_id uuid,
  organization_name text,
  organization_industry text default null,
  organization_description text default null,
  organization_business_context text default null,
  organization_engagement_start_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_name text := trim(coalesce(organization_name, ''));
begin
  if actor_id is null or not exists (
    select 1
    from public.organization_memberships membership
    where membership.user_id = actor_id
      and membership.status = 'active'
      and membership.role = 'delaro_admin'
  ) then
    raise exception 'Delaro administrator access required';
  end if;
  if requested_organization_id is null then
    raise exception 'A provisioning request ID is required';
  end if;
  if length(normalized_name) < 2 then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (
    id, name, industry, description, business_context, engagement_start_date,
    status, engagement_stage, demo_mode, account_owner_id
  ) values (
    requested_organization_id, normalized_name, nullif(trim(organization_industry), ''),
    nullif(trim(organization_description), ''), nullif(trim(organization_business_context), ''),
    organization_engagement_start_date, 'active', 'onboarding', false, actor_id
  )
  on conflict (id) do nothing;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (requested_organization_id, actor_id, 'delaro_admin', 'active')
  on conflict (organization_id, user_id) do nothing;

  if not exists (
    select 1
    from public.organizations organization
    join public.organization_memberships membership
      on membership.organization_id = organization.id
     and membership.user_id = actor_id
    where organization.id = requested_organization_id
      and organization.account_owner_id = actor_id
      and organization.name = normalized_name
      and organization.demo_mode = false
      and membership.role = 'delaro_admin'
      and membership.status = 'active'
  ) then
    raise exception 'Provisioning request conflicts with an existing organization';
  end if;

  return requested_organization_id;
end;
$$;

revoke all on function public.provision_client_organization(uuid,text,text,text,text,date)
  from public, anon;
grant execute on function public.provision_client_organization(uuid,text,text,text,text,date)
  to authenticated;

create or replace function private.enforce_initiative_implementation_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_phase in ('Build', 'Test', 'Deploy', 'Measure')
     or new.status = 'Complete' then
    if not exists (
      select 1
      from public.decisions decision
      join public.approvals approval
        on approval.organization_id = decision.organization_id
       and approval.decision_id = decision.id
      where decision.organization_id = new.organization_id
        and decision.initiative_id = new.id
        and decision.kind = 'approval'
        and decision.client_visible = true
        and decision.status = 'approved'
        and decision.decided_at is not null
        and approval.status = 'approved'
        and approval.responded_at is not null
        and approval.responded_by_membership_id is not null
    ) then
      raise exception 'A recorded client approval is required before this improvement can enter implementation or completion';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_initiative_implementation_approval()
  from public, anon, authenticated;

create trigger initiatives_require_implementation_approval
  before insert or update on public.initiatives
  for each row execute function private.enforce_initiative_implementation_approval();
