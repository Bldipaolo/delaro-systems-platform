-- Keep provisioning on ordinary RLS-governed writes instead of an exposed SECURITY DEFINER RPC.
drop function if exists public.provision_client_organization(text,text,text,text,date);

grant insert on public.organizations to authenticated;

create or replace function private.can_bootstrap_owned_organization(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations organization
    where organization.id = target_org
      and organization.account_owner_id = (select auth.uid())
      and not exists (
        select 1 from public.organization_memberships existing
        where existing.organization_id = organization.id
      )
  );
$$;
revoke all on function private.can_bootstrap_owned_organization(uuid) from public, anon, authenticated;

create policy "Delaro admins create organizations"
  on public.organizations for insert to authenticated
  with check (
    private.is_delaro_admin()
    and account_owner_id = (select auth.uid())
    and demo_mode = false
  );

drop policy "Delaro admins add organization memberships" on public.organization_memberships;
create policy "Delaro admins add organization memberships"
  on public.organization_memberships for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['delaro_admin']::public.organization_member_role[])
    or (
      private.is_delaro_admin()
      and user_id = (select auth.uid())
      and role = 'delaro_admin'
      and status = 'active'
      and private.can_bootstrap_owned_organization(organization_id)
    )
  );
