-- Keep RLS membership lookups out of the exposed public RPC schema. The
-- public compatibility wrappers are invokers; policies retain their OIDs.
create function private.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_org
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;
create function private.has_org_role(target_org uuid, allowed_roles public.organization_member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_org
      and user_id = (select auth.uid())
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;
revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, public.organization_member_role[]) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.organization_member_role[]) to authenticated;

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_org_member(target_org);
$$;
create or replace function public.has_org_role(target_org uuid, allowed_roles public.organization_member_role[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.has_org_role(target_org, allowed_roles);
$$;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.has_org_role(uuid, public.organization_member_role[]) from anon;
