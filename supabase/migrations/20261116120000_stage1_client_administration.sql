-- Stage 1: secure client provisioning and membership administration.
-- Browser-selected organization IDs remain preferences; every write is authorized here and in server actions.

alter table public.organizations
  add column if not exists business_context text,
  add column if not exists engagement_stage text not null default 'onboarding'
    check (engagement_stage in ('onboarding','map','diagnose','quantify','prioritize','architect','implement','measure','improve'));

create or replace function private.is_delaro_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'delaro_admin'
  );
$$;

revoke all on function private.is_delaro_admin() from public, anon, authenticated;

create or replace function public.provision_client_organization(
  organization_name text,
  organization_industry text default null,
  organization_description text default null,
  organization_business_context text default null,
  organization_engagement_start_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organization_id uuid;
begin
  if not private.is_delaro_admin() then
    raise exception 'Delaro administrator access required';
  end if;
  if length(trim(coalesce(organization_name, ''))) < 2 then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (
    name, industry, description, business_context, engagement_start_date,
    status, engagement_stage, demo_mode, account_owner_id
  ) values (
    trim(organization_name), nullif(trim(organization_industry), ''),
    nullif(trim(organization_description), ''), nullif(trim(organization_business_context), ''),
    organization_engagement_start_date, 'active', 'onboarding', false, (select auth.uid())
  ) returning id into created_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (created_organization_id, (select auth.uid()), 'delaro_admin', 'active');

  return created_organization_id;
end;
$$;

revoke all on function public.provision_client_organization(text,text,text,text,date) from public, anon;
grant execute on function public.provision_client_organization(text,text,text,text,date) to authenticated;

grant update on public.organizations to authenticated;
grant insert, update on public.organization_memberships to authenticated;

create policy "Delaro admins update organizations"
  on public.organizations for update to authenticated
  using (private.has_org_role(id, array['delaro_admin']::public.organization_member_role[]))
  with check (private.has_org_role(id, array['delaro_admin']::public.organization_member_role[]));

create policy "Delaro admins add organization memberships"
  on public.organization_memberships for insert to authenticated
  with check (private.has_org_role(organization_id, array['delaro_admin']::public.organization_member_role[]));

create policy "Delaro admins update organization memberships"
  on public.organization_memberships for update to authenticated
  using (private.has_org_role(organization_id, array['delaro_admin']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id, array['delaro_admin']::public.organization_member_role[]));

create policy "Internal members view profiles in their organizations"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.organization_memberships target_membership
      where target_membership.user_id = profiles.id
        and private.has_org_role(
          target_membership.organization_id,
          array['delaro_admin','delaro_consultant']::public.organization_member_role[]
        )
    )
  );

create or replace function private.protect_membership_identity_and_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.id, new.organization_id, new.user_id) is distinct from row(old.id, old.organization_id, old.user_id) then
    raise exception 'Membership identity cannot be changed';
  end if;

  if old.role = 'delaro_admin' and old.status = 'active'
    and (new.role <> 'delaro_admin' or new.status <> 'active')
    and not exists (
      select 1 from public.organization_memberships other_admin
      where other_admin.organization_id = old.organization_id
        and other_admin.id <> old.id
        and other_admin.role = 'delaro_admin'
        and other_admin.status = 'active'
    ) then
    raise exception 'The final active Delaro administrator cannot be suspended or reassigned';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_membership_identity_and_admin() from public, anon, authenticated;
create trigger memberships_protect_identity_and_admin
  before update on public.organization_memberships
  for each row execute function private.protect_membership_identity_and_admin();

create index if not exists organizations_engagement_stage_idx
  on public.organizations (status, engagement_stage);
