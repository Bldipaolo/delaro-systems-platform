create extension if not exists "pgcrypto";

create type public.organization_status as enum ('prospect', 'active', 'paused', 'complete', 'archived');
create type public.organization_member_role as enum ('delaro_admin', 'delaro_consultant', 'client_admin', 'client_user', 'read_only');
create type public.membership_status as enum ('invited', 'active', 'suspended');

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  description text,
  status public.organization_status not null default 'active',
  primary_contact_id uuid references public.profiles(id) on delete set null,
  engagement_start_date date,
  account_owner_id uuid references public.profiles(id) on delete set null,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_member_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.operational_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles public.organization_member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.operational_areas enable row level security;

create policy "Users can view their own profile" on public.profiles for select using (id = auth.uid());
create policy "Members can view their organizations" on public.organizations for select using (public.is_org_member(id));
create policy "Members can view memberships in their organizations" on public.organization_memberships for select using (public.is_org_member(organization_id));
create policy "Members can view operational areas" on public.operational_areas for select using (public.is_org_member(organization_id));
create policy "Admins can manage operational areas" on public.operational_areas for all using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[]));

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations for each row execute procedure public.set_updated_at();
create trigger memberships_updated_at before update on public.organization_memberships for each row execute procedure public.set_updated_at();
create trigger operational_areas_updated_at before update on public.operational_areas for each row execute procedure public.set_updated_at();
