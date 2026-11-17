-- PostgreSQL applies SELECT RLS to INSERT ... ON CONFLICT even when the row is
-- new. Permit a Delaro admin to see only their own orphaned provisioning row,
-- then use explicit unique-violation handling for safe retries.
create policy "Delaro admins view owned provisioning rows"
  on public.organizations for select to authenticated
  using (
    private.is_delaro_admin()
    and account_owner_id = (select auth.uid())
  );

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

  begin
    insert into public.organizations (
      id, name, industry, description, business_context, engagement_start_date,
      status, engagement_stage, demo_mode, account_owner_id
    ) values (
      requested_organization_id, normalized_name, nullif(trim(organization_industry), ''),
      nullif(trim(organization_description), ''), nullif(trim(organization_business_context), ''),
      organization_engagement_start_date, 'active', 'onboarding', false, actor_id
    );
  exception when unique_violation then
    if not exists (
      select 1 from public.organizations organization
      where organization.id = requested_organization_id
        and organization.account_owner_id = actor_id
        and organization.name = normalized_name
        and organization.demo_mode = false
    ) then
      raise exception 'Provisioning request conflicts with an existing organization';
    end if;
  end;

  begin
    insert into public.organization_memberships (organization_id, user_id, role, status)
    values (requested_organization_id, actor_id, 'delaro_admin', 'active');
  exception when unique_violation then
    null;
  end;

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
