-- Stage 4C checkpoint 1: tenant-scoped measurement sources and a server-only
-- encrypted credential store. Provider secrets never enter public tables.

create table public.measurement_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  system_id uuid,
  name text not null check (length(trim(name)) between 2 and 160),
  description text check (description is null or length(description) <= 1200),
  provider_type text not null check (provider_type in (
    'n8n','hubspot','api','database','webhook','csv','manual','other'
  )),
  connection_mode text not null check (connection_mode in ('push','pull','manual')),
  external_reference text check (external_reference is null or length(external_reference) <= 500),
  public_configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_configuration) = 'object'),
  status text not null default 'draft'
    check (status in ('draft','configured','healthy','stale','degraded','disabled')),
  client_visible boolean not null default false,
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,system_id)
    references public.systems(organization_id,id) on delete set null (system_id),
  foreign key (organization_id,created_by_membership_id)
    references public.organization_memberships(organization_id,id) on delete set null (created_by_membership_id),
  foreign key (organization_id,updated_by_membership_id)
    references public.organization_memberships(organization_id,id) on delete set null (updated_by_membership_id),
  check ((status = 'disabled') = (disabled_at is not null))
);

create unique index measurement_sources_external_reference_idx
  on public.measurement_sources (organization_id,provider_type,external_reference)
  where external_reference is not null and status <> 'disabled';
create index measurement_sources_status_idx
  on public.measurement_sources (organization_id,status,provider_type);
create index measurement_sources_system_idx
  on public.measurement_sources (organization_id,system_id)
  where system_id is not null;
create index measurement_sources_created_by_idx
  on public.measurement_sources (organization_id,created_by_membership_id)
  where created_by_membership_id is not null;
create index measurement_sources_updated_by_idx
  on public.measurement_sources (organization_id,updated_by_membership_id)
  where updated_by_membership_id is not null;

create function private.stage4c_guard_measurement_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  if new.public_configuration::text ~* '"[^\"]*(secret|token|password|authorization|api[_ -]?key)[^\"]*"[[:space:]]*:' then
    raise data_exception using message = 'Secrets are not allowed in public measurement source configuration';
  end if;
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  select membership.id into actor
  from public.organization_memberships membership
  where membership.organization_id = new.organization_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('delaro_admin','delaro_consultant')
  limit 1;
  if actor is null then
    raise insufficient_privilege using message = 'Internal measurement-source access required';
  end if;
  if tg_op = 'INSERT' then
    new.created_by_membership_id := actor;
  else
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise check_violation using message = 'Measurement source identity is immutable';
    end if;
    new.created_by_membership_id := old.created_by_membership_id;
  end if;
  new.updated_by_membership_id := actor;
  if new.status = 'disabled' and new.disabled_at is null then
    new.disabled_at := clock_timestamp();
  elsif new.status <> 'disabled' then
    new.disabled_at := null;
  end if;
  return new;
end $$;

create trigger measurement_sources_guard
  before insert or update on public.measurement_sources
  for each row execute function private.stage4c_guard_measurement_source();

create trigger measurement_sources_updated_at
  before update on public.measurement_sources
  for each row execute function public.set_updated_at();

alter table public.measurement_sources enable row level security;
revoke all on public.measurement_sources from anon,authenticated;
grant select,insert,update,delete on public.measurement_sources to authenticated;

create policy "Internal users manage measurement sources" on public.measurement_sources
  for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Members view published measurement sources" on public.measurement_sources
  for select to authenticated
  using (
    client_visible
    and status in ('configured','healthy','stale','degraded')
    and private.is_org_member(organization_id)
  );

create table private.measurement_source_secrets (
  source_id uuid primary key,
  organization_id uuid not null,
  secret_type text not null check (secret_type in ('api_key','oauth_token','basic_auth','connection_string','other')),
  encrypted_payload text not null check (length(encrypted_payload) between 16 and 32768),
  encryption_iv text not null check (length(encryption_iv) between 12 and 128),
  encryption_tag text not null check (length(encryption_tag) between 12 and 128),
  key_version smallint not null default 1 check (key_version > 0),
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,source_id)
    references public.measurement_sources(organization_id,id) on delete cascade
);

revoke all on private.measurement_source_secrets from public,anon,authenticated;

create function public.store_measurement_source_secret(
  target_source_id uuid,
  target_organization_id uuid,
  target_secret_type text,
  target_encrypted_payload text,
  target_encryption_iv text,
  target_encryption_tag text,
  target_key_version smallint default 1
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if not exists (
    select 1 from public.measurement_sources source
    where source.id = target_source_id and source.organization_id = target_organization_id
  ) then
    raise foreign_key_violation using message = 'Measurement source not found';
  end if;
  insert into private.measurement_source_secrets(
    source_id,organization_id,secret_type,encrypted_payload,encryption_iv,encryption_tag,key_version,rotated_at
  ) values (
    target_source_id,target_organization_id,target_secret_type,target_encrypted_payload,
    target_encryption_iv,target_encryption_tag,target_key_version,clock_timestamp()
  )
  on conflict (source_id) do update set
    organization_id = excluded.organization_id,
    secret_type = excluded.secret_type,
    encrypted_payload = excluded.encrypted_payload,
    encryption_iv = excluded.encryption_iv,
    encryption_tag = excluded.encryption_tag,
    key_version = excluded.key_version,
    rotated_at = clock_timestamp(),
    updated_at = clock_timestamp();
end $$;

create function public.read_measurement_source_secret(target_source_id uuid)
returns table (
  organization_id uuid,
  secret_type text,
  encrypted_payload text,
  encryption_iv text,
  encryption_tag text,
  key_version smallint
)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  return query
    select stored.organization_id,stored.secret_type,stored.encrypted_payload,
           stored.encryption_iv,stored.encryption_tag,stored.key_version
    from private.measurement_source_secrets stored
    where stored.source_id = target_source_id;
end $$;

create function public.delete_measurement_source_secret(target_source_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  delete from private.measurement_source_secrets stored where stored.source_id = target_source_id;
end $$;

revoke all on function public.store_measurement_source_secret(uuid,uuid,text,text,text,text,smallint) from public,anon,authenticated;
revoke all on function public.read_measurement_source_secret(uuid) from public,anon,authenticated;
revoke all on function public.delete_measurement_source_secret(uuid) from public,anon,authenticated;
grant execute on function public.store_measurement_source_secret(uuid,uuid,text,text,text,text,smallint) to service_role;
grant execute on function public.read_measurement_source_secret(uuid) to service_role;
grant execute on function public.delete_measurement_source_secret(uuid) to service_role;

comment on table public.measurement_sources is
  'Tenant-scoped measurement source metadata. public_configuration must never contain secrets.';
comment on column public.measurement_sources.public_configuration is
  'Client-safe non-secret provider metadata only. Credentials belong in private.measurement_source_secrets.';
comment on table private.measurement_source_secrets is
  'Application-encrypted provider credentials available only through service-role RPCs.';
