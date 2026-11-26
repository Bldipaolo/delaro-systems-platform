-- Stage 4C checkpoint 6: provider-neutral source metadata, permanent-failure
-- handling, private incremental cursor state, and database-enforced mapping
-- constraints. No provider payload is retained.

alter table private.measurement_source_secrets
  drop constraint if exists measurement_source_secrets_secret_type_check,
  add constraint measurement_source_secrets_secret_type_check check (
    secret_type in ('api_key','oauth_token','basic_auth','connection_string','hubspot_service_key','other')
  );
alter table private.measurement_source_secrets enable row level security;

alter table public.measurement_sources
  drop constraint if exists measurement_sources_connection_mode_check,
  drop constraint if exists measurement_sources_status_check,
  add column source_category text not null default 'custom'
    check (source_category in ('crm','erp','accounting','scheduling','database','api','automation','support','spreadsheet','file_import','custom','manual')),
  add column environment text not null default 'production'
    check (environment in ('production','sandbox','test','other')),
  add column last_error_classification text
    check (last_error_classification is null or last_error_classification in (
      'authentication','authorization','rate_limit','timeout','provider_unavailable',
      'invalid_mapping','validation','configuration','internal','unknown'
    )),
  add constraint measurement_sources_connection_mode_check
    check (connection_mode in ('push','pull','batch','manual')),
  add constraint measurement_sources_status_check
    check (status in ('draft','configured','healthy','stale','degraded','failed','authentication_required','disabled'));

update public.measurement_sources set source_category = case provider_type
  when 'hubspot' then 'crm'
  when 'n8n' then 'automation'
  when 'database' then 'database'
  when 'api' then 'api'
  when 'webhook' then 'api'
  when 'csv' then 'file_import'
  when 'manual' then 'manual'
  else 'custom' end;

drop policy if exists "Members view published measurement sources" on public.measurement_sources;
create policy "Members view published measurement sources" on public.measurement_sources
  for select to authenticated using (
    client_visible
    and status in ('configured','healthy','stale','degraded','failed','authentication_required')
    and private.is_org_member(organization_id)
  );

drop policy if exists "Members view published measurement mappings" on public.measurement_source_mappings;
create policy "Members view published measurement mappings" on public.measurement_source_mappings
  for select to authenticated using (
    client_visible and status='active' and private.is_org_member(organization_id)
    and exists (
      select 1 from public.measurement_sources source
      where source.organization_id=measurement_source_mappings.organization_id
        and source.id=measurement_source_mappings.source_id and source.client_visible
        and source.status in ('configured','healthy','stale','degraded','failed','authentication_required')
    )
    and exists (
      select 1 from public.measurement_metrics metric
      where metric.organization_id=measurement_source_mappings.organization_id
        and metric.id=measurement_source_mappings.metric_id and metric.client_visible
    )
  );

alter table public.measurement_source_mappings
  drop constraint if exists measurement_source_mappings_aggregation_method_check,
  add column priority smallint not null default 100 check (priority between 1 and 1000),
  add constraint measurement_source_mappings_aggregation_method_check
    check (aggregation_method in ('latest','count','sum','average','median','minimum','maximum'));

create or replace function private.stage4c_guard_measurement_mapping()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid;
declare source_provider text;
begin
  if new.filter_definition::text ~* '"[^\"]*(secret|token|password|authorization|api[_ -]?key)[^\"]*"[[:space:]]*:' then
    raise data_exception using message='Secrets are not allowed in metric mapping filters';
  end if;
  if new.value_field ~ '(^|\.)(__proto__|prototype|constructor)(\.|$)'
     or coalesce(new.timestamp_field,'') ~ '(^|\.)(__proto__|prototype|constructor)(\.|$)'
     or coalesce(new.external_id_field,'') ~ '(^|\.)(__proto__|prototype|constructor)(\.|$)' then
    raise data_exception using message='Unsafe provider field path';
  end if;
  select source.provider_type into source_provider
  from public.measurement_sources source
  where source.organization_id=new.organization_id and source.id=new.source_id;
  if source_provider is null then raise foreign_key_violation using message='Measurement source not found'; end if;
  if source_provider='hubspot' and new.provider_object not in ('contacts','companies','deals','tickets','products','line_items','quotes') then
    raise data_exception using message='Unsupported HubSpot object type';
  end if;
  if (select auth.role())='service_role'
     or ((select auth.uid()) is null and (select auth.role()) is distinct from 'authenticated') then
    return new;
  end if;
  select membership.id into actor
  from public.organization_memberships membership
  where membership.organization_id=new.organization_id
    and membership.user_id=(select auth.uid())
    and membership.status='active'
    and membership.role in ('delaro_admin','delaro_consultant')
  limit 1;
  if actor is null then raise insufficient_privilege using message='Internal metric-mapping access required'; end if;
  if tg_op='INSERT' then
    new.created_by_membership_id := actor;
  else
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise check_violation using message='Metric mapping identity is immutable';
    end if;
    new.created_by_membership_id := old.created_by_membership_id;
  end if;
  new.updated_by_membership_id := actor;
  return new;
end $$;

create table private.measurement_source_sync_state (
  source_id uuid primary key,
  organization_id uuid not null,
  cursor_state jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor_state)='object'),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,source_id)
    references public.measurement_sources(organization_id,id) on delete cascade
);
alter table private.measurement_source_sync_state enable row level security;
revoke all on private.measurement_source_sync_state from public,anon,authenticated;

create function public.read_measurement_source_sync_state(target_source_id uuid)
returns table (organization_id uuid,cursor_state jsonb)
language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise insufficient_privilege using message='Service role required'; end if;
  return query select state.organization_id,state.cursor_state
  from private.measurement_source_sync_state state where state.source_id=target_source_id;
end $$;

create function public.store_measurement_source_sync_state(
  target_source_id uuid,target_organization_id uuid,target_cursor_state jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise insufficient_privilege using message='Service role required'; end if;
  if jsonb_typeof(target_cursor_state) <> 'object' or length(target_cursor_state::text) > 4000
     or target_cursor_state::text ~* '(secret|token|password|authorization|api[_ -]?key)' then
    raise data_exception using message='Invalid measurement source cursor state';
  end if;
  insert into private.measurement_source_sync_state(source_id,organization_id,cursor_state)
  values(target_source_id,target_organization_id,target_cursor_state)
  on conflict(source_id) do update set
    organization_id=excluded.organization_id,cursor_state=excluded.cursor_state,updated_at=clock_timestamp();
end $$;

revoke all on function public.read_measurement_source_sync_state(uuid) from public,anon,authenticated;
revoke all on function public.store_measurement_source_sync_state(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_measurement_source_sync_state(uuid) to service_role;
grant execute on function public.store_measurement_source_sync_state(uuid,uuid,jsonb) to service_role;

alter table public.measurement_sync_runs
  add column error_classification text
    check (error_classification is null or error_classification in (
      'authentication','authorization','rate_limit','timeout','provider_unavailable',
      'invalid_mapping','validation','configuration','internal','unknown'
    )),
  add column provider_request_count integer not null default 0 check (provider_request_count >= 0),
  add column correlation_id uuid not null default gen_random_uuid(),
  add column idempotency_key text check (idempotency_key is null or length(idempotency_key) between 8 and 200);
create unique index measurement_sync_runs_correlation_idx on public.measurement_sync_runs(correlation_id);
create unique index measurement_sync_runs_idempotency_idx
  on public.measurement_sync_runs(organization_id,idempotency_key) where idempotency_key is not null;
create index measurement_source_sync_state_tenant_idx
  on private.measurement_source_sync_state(organization_id,source_id);

create or replace function private.stage4c_guard_source_schedule()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status in ('disabled','failed','authentication_required') or new.connection_mode <> 'pull' then
    new.schedule_enabled := false;
    new.next_sync_at := null;
  elsif new.schedule_enabled and new.next_sync_at is null then
    new.next_sync_at := clock_timestamp();
  end if;
  return new;
end $$;

create or replace function public.complete_measurement_sync_run(
  target_run_id uuid,
  final_status text,
  reported_records_seen integer,
  reported_records_accepted integer,
  reported_records_duplicate integer,
  reported_records_failed integer,
  reported_cursor_reference text,
  reported_error_code text,
  reported_error_summary text,
  reported_last_record_at timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare run public.measurement_sync_runs%rowtype;
declare source public.measurement_sources%rowtype;
declare retry_minutes integer;
declare failure_class text;
declare permanent_failure boolean;
begin
  if (select auth.role()) <> 'service_role' then raise insufficient_privilege using message='Service role required'; end if;
  if final_status not in ('succeeded','partial','failed','cancelled')
     or reported_records_seen < 0 or reported_records_accepted < 0
     or reported_records_duplicate < 0 or reported_records_failed < 0
     or reported_records_accepted+reported_records_duplicate+reported_records_failed > reported_records_seen
     or length(coalesce(reported_cursor_reference,'')) > 1000
     or length(coalesce(reported_error_code,'')) > 100
     or length(coalesce(reported_error_summary,'')) > 500 then
    raise data_exception using message='Invalid measurement sync result';
  end if;
  select * into run from public.measurement_sync_runs stored
    where stored.id=target_run_id and stored.status='running' for update;
  if not found then raise check_violation using message='Measurement sync run is not active'; end if;
  select * into source from public.measurement_sources stored
    where stored.organization_id=run.organization_id and stored.id=run.source_id for update;
  failure_class := case
    when reported_error_code in ('AUTHORIZATION_FAILED','INVALID_CREDENTIAL') then 'authentication'
    when reported_error_code='FORBIDDEN' then 'authorization'
    when reported_error_code='RATE_LIMITED' then 'rate_limit'
    when reported_error_code='TIMEOUT' then 'timeout'
    when reported_error_code='PROVIDER_UNAVAILABLE' then 'provider_unavailable'
    when reported_error_code in ('RECORD_NORMALIZATION_FAILED','INVALID_MAPPING','MAPPING_MISSING') then 'invalid_mapping'
    when reported_error_code in ('INVALID_RESPONSE','PROVIDER_REJECTED') then 'validation'
    when reported_error_code in ('ADAPTER_UNAVAILABLE','CREDENTIAL_UNAVAILABLE') then 'configuration'
    when reported_error_code is null or trim(reported_error_code)='' then null
    else 'unknown' end;
  permanent_failure := failure_class in ('authentication','authorization','invalid_mapping','configuration');
  update public.measurement_sync_runs stored set
    status=final_status,records_seen=reported_records_seen,
    records_accepted=reported_records_accepted,records_duplicate=reported_records_duplicate,
    records_failed=reported_records_failed,cursor_reference=nullif(trim(reported_cursor_reference),''),
    error_code=nullif(trim(reported_error_code),''),error_classification=failure_class,
    error_summary=nullif(trim(reported_error_summary),''),finished_at=clock_timestamp()
  where stored.id=run.id;
  if final_status='succeeded' then
    update public.measurement_sources stored set
      status='healthy',last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_successful_at=clock_timestamp(),last_record_at=coalesce(reported_last_record_at,stored.last_record_at),
      consecutive_failures=0,last_error_classification=null,
      health_summary='Source synchronized successfully',health_checked_at=clock_timestamp(),
      next_sync_at=case when stored.schedule_enabled then clock_timestamp()+make_interval(mins=>stored.schedule_interval_minutes) else stored.next_sync_at end
    where stored.id=source.id;
  elsif final_status='partial' then
    update public.measurement_sources stored set
      status='degraded',last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_successful_at=case when reported_records_accepted>0 then clock_timestamp() else stored.last_successful_at end,
      last_failed_at=clock_timestamp(),last_record_at=coalesce(reported_last_record_at,stored.last_record_at),
      consecutive_failures=stored.consecutive_failures+1,last_error_classification=coalesce(failure_class,'validation'),
      health_summary='Source synchronized with rejected records',health_checked_at=clock_timestamp()
    where stored.id=source.id;
  elsif final_status='failed' and permanent_failure then
    update public.measurement_sources stored set
      status=case when failure_class in ('authentication','authorization') then 'authentication_required' else 'failed' end,
      schedule_enabled=false,next_sync_at=null,last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_failed_at=clock_timestamp(),consecutive_failures=stored.consecutive_failures+1,
      last_error_classification=failure_class,
      health_summary=case when failure_class in ('authentication','authorization') then 'Provider authorization must be reconnected' else 'Source configuration requires repair' end,
      health_checked_at=clock_timestamp()
    where stored.id=source.id;
  elsif final_status='failed' then
    retry_minutes := least(60,5*(2^least(run.attempt-1,4))::integer);
    update public.measurement_sources stored set
      status='degraded',last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_failed_at=clock_timestamp(),consecutive_failures=stored.consecutive_failures+1,
      last_error_classification=coalesce(failure_class,'unknown'),
      health_summary='Source synchronization requires review',health_checked_at=clock_timestamp(),
      next_sync_at=clock_timestamp()+make_interval(mins=>retry_minutes)
    where stored.id=source.id;
  else
    update public.measurement_sources stored set
      last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      health_summary='Source synchronization was cancelled',health_checked_at=clock_timestamp()
    where stored.id=source.id;
  end if;
end $$;

comment on table private.measurement_source_sync_state is
  'Service-only bounded provider cursor state. Contains no provider payload or credential material.';
