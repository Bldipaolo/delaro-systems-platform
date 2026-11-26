-- OUT parameters share names with tenant columns; explicitly resolve SQL
-- references to table columns inside this bounded worker-claim function.
create or replace function public.claim_due_measurement_sync_runs(maximum_runs integer default 5)
returns table (
  run_id uuid,
  organization_id uuid,
  source_id uuid,
  provider_type text,
  attempt integer
) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
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
