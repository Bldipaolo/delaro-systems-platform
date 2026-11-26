-- Run with an administrative connection. Every fixture is rolled back.
begin;

insert into auth.users(id,email) values
  ('e4300000-0000-4000-8000-000000000001','stage4c-hardening-internal@example.invalid'),
  ('e4300000-0000-4000-8000-000000000002','stage4c-hardening-client@example.invalid'),
  ('e4300000-0000-4000-8000-000000000003','stage4c-hardening-foreign@example.invalid'),
  ('e4300000-0000-4000-8000-000000000004','stage4c-hardening-suspended@example.invalid');
insert into public.organizations(id,name) values
  ('e4310000-0000-4000-8000-000000000001','Stage 4C hardened tenant'),
  ('e4310000-0000-4000-8000-000000000002','Stage 4C hardened foreign tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('e4320000-0000-4000-8000-000000000001','e4310000-0000-4000-8000-000000000001','e4300000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('e4320000-0000-4000-8000-000000000002','e4310000-0000-4000-8000-000000000001','e4300000-0000-4000-8000-000000000002','client_admin','active'),
  ('e4320000-0000-4000-8000-000000000003','e4310000-0000-4000-8000-000000000002','e4300000-0000-4000-8000-000000000003','delaro_admin','active'),
  ('e4320000-0000-4000-8000-000000000004','e4310000-0000-4000-8000-000000000001','e4300000-0000-4000-8000-000000000004','client_admin','suspended');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e4300000-0000-4000-8000-000000000001',true);
insert into public.measurement_metrics(
  id,organization_id,name,unit,improvement_direction,metric_type,client_visible,auto_publish_observations
) values (
  'e4330000-0000-4000-8000-000000000001','e4310000-0000-4000-8000-000000000001',
  'Hardened lead volume','count','increase','count',true,true
);
insert into public.measurement_sources(
  id,organization_id,name,provider_type,source_category,connection_mode,environment,status,
  client_visible,schedule_enabled,schedule_interval_minutes
) values (
  'e4340000-0000-4000-8000-000000000001','e4310000-0000-4000-8000-000000000001',
  'Hardened HubSpot source','hubspot','crm','pull','test','configured',true,true,15
);
insert into public.measurement_source_mappings(
  id,organization_id,source_id,metric_id,name,provider_object,value_field,timestamp_field,
  external_id_field,aggregation_method,period_granularity,status,client_visible
) values (
  'e4350000-0000-4000-8000-000000000001','e4310000-0000-4000-8000-000000000001',
  'e4340000-0000-4000-8000-000000000001','e4330000-0000-4000-8000-000000000001',
  'Daily lead count','contacts','id','createdAt','id','count','day','active',true
);
do $$ begin
  begin
    insert into public.measurement_source_mappings(
      organization_id,source_id,metric_id,name,provider_object,value_field
    ) values (
      'e4310000-0000-4000-8000-000000000001','e4340000-0000-4000-8000-000000000001',
      'e4330000-0000-4000-8000-000000000001','Invalid object mapping','email_bodies','properties.body'
    );
    raise exception 'Unsupported HubSpot object was accepted';
  exception when data_exception then null;
  end;
  begin
    update public.measurement_source_mappings set value_field='constructor.prototype'
    where id='e4350000-0000-4000-8000-000000000001';
    raise exception 'Unsafe provider path was accepted';
  exception when data_exception then null;
  end;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.store_measurement_source_secret(
  'e4340000-0000-4000-8000-000000000001','e4310000-0000-4000-8000-000000000001',
  'hubspot_service_key','encrypted-fixture-payload','fixture-initialization-vector','fixture-authentication-tag',1::smallint
);
select public.store_measurement_source_sync_state(
  'e4340000-0000-4000-8000-000000000001','e4310000-0000-4000-8000-000000000001',
  '{"contacts":"1001"}'::jsonb
);
do $$ declare claimed record; begin
  if (select cursor_state->>'contacts' from public.read_measurement_source_sync_state('e4340000-0000-4000-8000-000000000001')) <> '1001' then
    raise exception 'Private cursor state round trip failed';
  end if;
  select * into claimed from public.claim_due_measurement_sync_runs(1) limit 1;
  perform public.complete_measurement_sync_run(
    claimed.run_id,'failed',0,0,0,0,'','AUTHORIZATION_FAILED','Fixture authorization rejected',null
  );
  if not exists (
    select 1 from public.measurement_sources
    where id='e4340000-0000-4000-8000-000000000001'
      and status='authentication_required' and not schedule_enabled
      and last_error_classification='authentication'
  ) then raise exception 'Permanent authentication failure was not quarantined'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e4300000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.measurement_sources) <> 1
     or (select count(*) from public.measurement_source_mappings) <> 1 then
    raise exception 'Client-safe failed source provenance is unavailable';
  end if;
  if exists(select 1 from public.measurement_sync_runs) then
    raise exception 'Client can read internal synchronization diagnostics';
  end if;
  begin
    perform public.read_measurement_source_secret('e4340000-0000-4000-8000-000000000001');
    raise exception 'Client executed provider secret RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.read_measurement_source_sync_state('e4340000-0000-4000-8000-000000000001');
    raise exception 'Client executed provider cursor RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ingest_mapped_metric_observation(
      'e4340000-0000-4000-8000-000000000001','e4350000-0000-4000-8000-000000000001',
      'forged-record',1,clock_timestamp(),current_date,current_date,1,'forged',clock_timestamp(),repeat('a',64)
    );
    raise exception 'Client executed service-only mapped ingestion';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_due_measurement_sync_runs(1);
    raise exception 'Client executed service-only sync claim';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','e4300000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.measurement_sources)
     or exists(select 1 from public.measurement_source_mappings)
     or exists(select 1 from public.measurement_sync_runs) then
    raise exception 'Cross-tenant source data was visible';
  end if;
  begin
    update public.measurement_sources set name='Cross-tenant mutation'
    where id='e4340000-0000-4000-8000-000000000001';
    if found then raise exception 'Cross-tenant source mutation succeeded'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','e4300000-0000-4000-8000-000000000004',true);
do $$ begin
  if exists(select 1 from public.measurement_sources)
     or exists(select 1 from public.measurement_source_mappings) then
    raise exception 'Suspended user retained measurement source access';
  end if;
end $$;
reset role;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema in ('public','private')
      and table_name in ('measurement_sources','measurement_source_mappings','measurement_sync_runs','measurement_source_ingestion_events')
      and column_name in ('raw_payload','provider_payload','request_payload','response_payload')
  ) then raise exception 'A raw provider payload column exists'; end if;
end $$;

rollback;
select 'Stage 4C credential isolation, cursor isolation, mapping validation, permanent failure, suspended-user, and cross-tenant assertions passed (fixtures rolled back)' as result;
