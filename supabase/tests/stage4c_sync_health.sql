-- Run with an administrative connection. Every fixture is rolled back.
begin;

insert into auth.users(id,email) values
  ('e4200000-0000-4000-8000-000000000001','stage4c-sync-internal@example.invalid'),
  ('e4200000-0000-4000-8000-000000000002','stage4c-sync-client@example.invalid');
insert into public.organizations(id,name)
values('e4210000-0000-4000-8000-000000000001','Stage 4C sync tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('e4220000-0000-4000-8000-000000000001','e4210000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('e4220000-0000-4000-8000-000000000002','e4210000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000002','client_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e4200000-0000-4000-8000-000000000001',true);
insert into public.measurement_sources(
  id,organization_id,name,provider_type,connection_mode,status,client_visible,
  schedule_enabled,schedule_interval_minutes,stale_after_minutes
) values (
  'e4230000-0000-4000-8000-000000000001','e4210000-0000-4000-8000-000000000001',
  'Scheduled fixture source','hubspot','pull','configured',true,true,15,60
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare claimed record;
begin
  select * into claimed from public.claim_due_measurement_sync_runs(5) limit 1;
  if claimed.run_id is null or claimed.source_id <> 'e4230000-0000-4000-8000-000000000001' then
    raise exception 'Due source was not claimed';
  end if;
  perform public.complete_measurement_sync_run(
    claimed.run_id,'failed',0,0,0,0,'','UPSTREAM_TIMEOUT','Fixture timeout',null
  );
  if not exists (
    select 1 from public.measurement_sources
    where id='e4230000-0000-4000-8000-000000000001' and status='degraded'
      and consecutive_failures=1 and next_sync_at > clock_timestamp()
  ) then raise exception 'Failed sync did not update retry health'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e4200000-0000-4000-8000-000000000001',true);
select public.request_measurement_source_sync('e4230000-0000-4000-8000-000000000001');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare claimed record;
begin
  select * into claimed from public.claim_due_measurement_sync_runs(5) limit 1;
  perform public.complete_measurement_sync_run(
    claimed.run_id,'succeeded',3,3,0,0,'cursor-2','','','2026-11-25T15:00:00Z'
  );
  if not exists (
    select 1 from public.measurement_sources
    where id='e4230000-0000-4000-8000-000000000001' and status='healthy'
      and consecutive_failures=0 and last_successful_at is not null
  ) then raise exception 'Successful sync did not restore healthy state'; end if;
  update public.measurement_sources set last_successful_at=clock_timestamp()-interval '2 hours'
    where id='e4230000-0000-4000-8000-000000000001';
  perform public.refresh_measurement_source_health();
  if not exists(select 1 from public.measurement_sources where id='e4230000-0000-4000-8000-000000000001' and status='stale') then
    raise exception 'Stale source was not detected';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e4200000-0000-4000-8000-000000000002',true);
do $$ begin
  if not exists(select 1 from public.measurement_sources where status='stale') then
    raise exception 'Client-safe source health is not visible';
  end if;
  if exists(select 1 from public.measurement_sync_runs) then
    raise exception 'Client can read internal sync diagnostics';
  end if;
end $$;
reset role;

rollback;
select 'Stage 4C scheduling, retry, recovery, stale detection, and client-safe health assertions passed (fixtures rolled back)' as result;
