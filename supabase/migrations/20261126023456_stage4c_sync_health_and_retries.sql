-- Stage 4C checkpoint 3: durable sync runs, bounded retries, scheduling, and
-- evidence-based source health. Provider calls remain in the server runtime.

alter table public.measurement_sources
  add column schedule_enabled boolean not null default false,
  add column schedule_interval_minutes integer not null default 60
    check (schedule_interval_minutes between 5 and 10080),
  add column stale_after_minutes integer not null default 1440
    check (stale_after_minutes between 15 and 525600),
  add column next_sync_at timestamptz,
  add column last_sync_started_at timestamptz,
  add column last_sync_completed_at timestamptz,
  add column last_successful_at timestamptz,
  add column last_failed_at timestamptz,
  add column last_record_at timestamptz,
  add column consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  add column health_summary text check (health_summary is null or length(health_summary) <= 240),
  add column health_checked_at timestamptz,
  add constraint measurement_sources_schedule_check check (
    not schedule_enabled or (connection_mode='pull' and status <> 'disabled')
  );

create index measurement_sources_due_idx
  on public.measurement_sources (next_sync_at)
  where schedule_enabled and status in ('configured','healthy','stale','degraded');

create function private.stage4c_guard_source_schedule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='disabled' or new.connection_mode <> 'pull' then
    new.schedule_enabled := false;
    new.next_sync_at := null;
  elsif new.schedule_enabled and new.next_sync_at is null then
    new.next_sync_at := clock_timestamp();
  end if;
  return new;
end $$;
create trigger stage4c_guard_source_schedule
  before insert or update on public.measurement_sources
  for each row execute function private.stage4c_guard_source_schedule();

create table public.measurement_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null,
  trigger_type text not null check (trigger_type in ('scheduled','manual','retry','webhook')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','partial','failed','cancelled')),
  attempt integer not null default 0 check (attempt between 0 and 10),
  cursor_reference text check (cursor_reference is null or length(cursor_reference) <= 1000),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_accepted integer not null default 0 check (records_accepted >= 0),
  records_duplicate integer not null default 0 check (records_duplicate >= 0),
  records_failed integer not null default 0 check (records_failed >= 0),
  error_code text check (error_code is null or length(error_code) <= 100),
  error_summary text check (error_summary is null or length(error_summary) <= 500),
  requested_by_membership_id uuid,
  next_retry_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,source_id)
    references public.measurement_sources(organization_id,id) on delete cascade,
  foreign key (organization_id,requested_by_membership_id)
    references public.organization_memberships(organization_id,id) on delete set null (requested_by_membership_id),
  check (status not in ('succeeded','partial','failed','cancelled') or finished_at is not null),
  check (status <> 'running' or started_at is not null)
);

create unique index measurement_sync_runs_one_inflight_idx
  on public.measurement_sync_runs (organization_id,source_id)
  where status in ('queued','running');
create index measurement_sync_runs_claim_idx
  on public.measurement_sync_runs (status,next_retry_at,created_at)
  where status='queued';
create index measurement_sync_runs_source_timeline_idx
  on public.measurement_sync_runs (organization_id,source_id,created_at desc);
create index measurement_sync_runs_requested_by_idx
  on public.measurement_sync_runs (organization_id,requested_by_membership_id)
  where requested_by_membership_id is not null;

alter table public.measurement_sync_runs enable row level security;
revoke all on public.measurement_sync_runs from anon,authenticated;
grant select on public.measurement_sync_runs to authenticated;
create policy "Internal users view measurement sync runs" on public.measurement_sync_runs
  for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create function public.request_measurement_source_sync(target_source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare source public.measurement_sources%rowtype;
declare actor uuid;
declare requested_run uuid;
begin
  select * into source from public.measurement_sources stored where stored.id=target_source_id;
  if not found or not private.has_org_role(source.organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]) then
    raise insufficient_privilege using message='Internal measurement-source access required';
  end if;
  if source.connection_mode <> 'pull' or source.status in ('draft','disabled') then
    raise check_violation using message='This source is not ready for pull synchronization';
  end if;
  select membership.id into actor from public.organization_memberships membership
  where membership.organization_id=source.organization_id and membership.user_id=(select auth.uid())
    and membership.status='active' and membership.role in ('delaro_admin','delaro_consultant')
  limit 1;
  insert into public.measurement_sync_runs(organization_id,source_id,trigger_type,requested_by_membership_id)
  values(source.organization_id,source.id,'manual',actor)
  on conflict (organization_id,source_id) where status in ('queued','running') do update
    set requested_by_membership_id=coalesce(public.measurement_sync_runs.requested_by_membership_id,excluded.requested_by_membership_id)
  returning id into requested_run;
  return requested_run;
end $$;
revoke all on function public.request_measurement_source_sync(uuid) from public,anon;
grant execute on function public.request_measurement_source_sync(uuid) to authenticated;

create function public.claim_due_measurement_sync_runs(maximum_runs integer default 5)
returns table (
  run_id uuid,
  organization_id uuid,
  source_id uuid,
  provider_type text,
  attempt integer
) language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message='Service role required';
  end if;
  insert into public.measurement_sync_runs(organization_id,source_id,trigger_type)
  select source.organization_id,source.id,
         case when source.consecutive_failures > 0 then 'retry' else 'scheduled' end
  from public.measurement_sources source
  where source.connection_mode='pull' and source.schedule_enabled
    and source.status in ('configured','healthy','stale','degraded')
    and coalesce(source.next_sync_at,clock_timestamp()) <= clock_timestamp()
  on conflict (organization_id,source_id) where status in ('queued','running') do nothing;

  update public.measurement_sources source set
    next_sync_at=clock_timestamp()+make_interval(mins=>source.schedule_interval_minutes)
  where source.connection_mode='pull' and source.schedule_enabled
    and source.status in ('configured','healthy','stale','degraded')
    and coalesce(source.next_sync_at,clock_timestamp()) <= clock_timestamp();

  return query
  with candidates as (
    select queued.id
    from public.measurement_sync_runs queued
    where queued.status='queued' and (queued.next_retry_at is null or queued.next_retry_at <= clock_timestamp())
    order by queued.created_at
    for update skip locked
    limit greatest(1,least(coalesce(maximum_runs,5),20))
  ), claimed as (
    update public.measurement_sync_runs run set
      status='running',attempt=run.attempt+1,started_at=clock_timestamp()
    from candidates where run.id=candidates.id
    returning run.id,run.organization_id,run.source_id,run.attempt
  )
  select claimed.id,claimed.organization_id,claimed.source_id,source.provider_type,claimed.attempt
  from claimed join public.measurement_sources source
    on source.organization_id=claimed.organization_id and source.id=claimed.source_id;
end $$;
revoke all on function public.claim_due_measurement_sync_runs(integer) from public,anon,authenticated;
grant execute on function public.claim_due_measurement_sync_runs(integer) to service_role;

create function public.complete_measurement_sync_run(
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
) returns void language plpgsql security definer set search_path = '' as $$
declare run public.measurement_sync_runs%rowtype;
declare source public.measurement_sources%rowtype;
declare retry_minutes integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message='Service role required';
  end if;
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
  update public.measurement_sync_runs stored set
    status=final_status,records_seen=reported_records_seen,
    records_accepted=reported_records_accepted,records_duplicate=reported_records_duplicate,
    records_failed=reported_records_failed,cursor_reference=nullif(trim(reported_cursor_reference),''),
    error_code=nullif(trim(reported_error_code),''),error_summary=nullif(trim(reported_error_summary),''),
    finished_at=clock_timestamp()
  where stored.id=run.id;
  if final_status='succeeded' then
    update public.measurement_sources stored set
      status='healthy',last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_successful_at=clock_timestamp(),last_record_at=coalesce(reported_last_record_at,stored.last_record_at),
      consecutive_failures=0,health_summary='Source synchronized successfully',health_checked_at=clock_timestamp(),
      next_sync_at=case when stored.schedule_enabled then clock_timestamp()+make_interval(mins=>stored.schedule_interval_minutes) else stored.next_sync_at end
    where stored.id=source.id;
  elsif final_status='partial' then
    update public.measurement_sources stored set
      status='degraded',last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_successful_at=case when reported_records_accepted>0 then clock_timestamp() else stored.last_successful_at end,
      last_failed_at=clock_timestamp(),last_record_at=coalesce(reported_last_record_at,stored.last_record_at),
      consecutive_failures=stored.consecutive_failures+1,health_summary='Source synchronized with rejected records',health_checked_at=clock_timestamp()
    where stored.id=source.id;
  elsif final_status='failed' then
    retry_minutes := least(60,5*(2^least(run.attempt-1,4))::integer);
    update public.measurement_sources stored set
      status='degraded',last_sync_started_at=run.started_at,last_sync_completed_at=clock_timestamp(),
      last_failed_at=clock_timestamp(),consecutive_failures=stored.consecutive_failures+1,
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
revoke all on function public.complete_measurement_sync_run(uuid,text,integer,integer,integer,integer,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.complete_measurement_sync_run(uuid,text,integer,integer,integer,integer,text,text,text,timestamptz)
  to service_role;

create function public.refresh_measurement_source_health()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message='Service role required';
  end if;
  update public.measurement_sources source set
    status='stale',health_summary='No recent measurement has been received',health_checked_at=clock_timestamp()
  where source.status='healthy' and source.last_successful_at is not null
    and source.last_successful_at < clock_timestamp()-make_interval(mins=>source.stale_after_minutes);
  get diagnostics affected = row_count;
  return affected;
end $$;
revoke all on function public.refresh_measurement_source_health() from public,anon,authenticated;
grant execute on function public.refresh_measurement_source_health() to service_role;

create function private.stage4c_note_observation_health()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.measurement_source_id is not null and new.measurement_status in ('observed','verified') then
    update public.measurement_sources source set
      status='healthy',last_successful_at=clock_timestamp(),
      last_record_at=greatest(coalesce(source.last_record_at,new.measured_at),new.measured_at),
      consecutive_failures=0,health_summary='Latest measurement received',health_checked_at=clock_timestamp()
    where source.organization_id=new.organization_id and source.id=new.measurement_source_id
      and source.status <> 'disabled';
  end if;
  return new;
end $$;
create trigger stage4c_note_observation_health
  after insert on public.metric_observations
  for each row execute function private.stage4c_note_observation_health();

comment on table public.measurement_sync_runs is
  'Internal payload-free audit log for scheduled and manual source synchronization.';
