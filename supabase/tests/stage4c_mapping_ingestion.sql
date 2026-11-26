-- Run with an administrative connection. Every fixture is rolled back.
begin;

insert into auth.users(id,email) values
  ('e4100000-0000-4000-8000-000000000001','stage4c-map-internal@example.invalid'),
  ('e4100000-0000-4000-8000-000000000002','stage4c-map-client@example.invalid'),
  ('e4100000-0000-4000-8000-000000000003','stage4c-map-foreign@example.invalid');
insert into public.organizations(id,name) values
  ('e4110000-0000-4000-8000-000000000001','Stage 4C mapping tenant'),
  ('e4110000-0000-4000-8000-000000000002','Stage 4C mapping foreign tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('e4120000-0000-4000-8000-000000000001','e4110000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('e4120000-0000-4000-8000-000000000002','e4110000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000002','client_admin','active'),
  ('e4120000-0000-4000-8000-000000000003','e4110000-0000-4000-8000-000000000002','e4100000-0000-4000-8000-000000000003','client_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','e4100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.measurement_metrics(
  id,organization_id,name,unit,improvement_direction,metric_type,client_visible,auto_publish_observations
) values (
  'e4130000-0000-4000-8000-000000000001','e4110000-0000-4000-8000-000000000001',
  'HubSpot response duration','seconds','decrease','duration',true,true
);
insert into public.measurement_sources(
  id,organization_id,name,provider_type,connection_mode,external_reference,
  public_configuration,status,client_visible
) values (
  'e4140000-0000-4000-8000-000000000001','e4110000-0000-4000-8000-000000000001',
  'HubSpot fixture','hubspot','pull','fixture-portal','{"account_label":"Fixture portal"}','configured',true
);
insert into public.measurement_source_mappings(
  id,organization_id,source_id,metric_id,name,provider_object,value_field,timestamp_field,
  external_id_field,transform_kind,aggregation_method,period_granularity,status,client_visible
) values (
  'e4150000-0000-4000-8000-000000000001','e4110000-0000-4000-8000-000000000001',
  'e4140000-0000-4000-8000-000000000001','e4130000-0000-4000-8000-000000000001',
  'Ticket response duration','tickets','properties.duration_ms','updatedAt','id',
  'duration_ms_to_seconds','average','day','active',true
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare first_result jsonb; duplicate_result jsonb;
begin
  first_result := public.ingest_mapped_metric_observation(
    'e4140000-0000-4000-8000-000000000001','e4150000-0000-4000-8000-000000000001',
    'ticket-day-2026-11-25',2500,'2026-11-25T15:00:00Z','2026-11-25','2026-11-25',5,
    'HubSpot fixture ticket period','2026-11-25T15:00:00Z',repeat('a',64)
  );
  duplicate_result := public.ingest_mapped_metric_observation(
    'e4140000-0000-4000-8000-000000000001','e4150000-0000-4000-8000-000000000001',
    'ticket-day-2026-11-25',9999,'2026-11-25T15:00:00Z','2026-11-25','2026-11-25',5,
    'HubSpot fixture ticket period','2026-11-25T15:00:00Z',repeat('b',64)
  );
  if first_result->>'duplicate' <> 'false' or duplicate_result->>'duplicate' <> 'true' then
    raise exception 'Mapped ingestion idempotency failed';
  end if;
  if not exists (
    select 1 from public.metric_observations
    where source_mapping_id='e4150000-0000-4000-8000-000000000001'
      and measured_value=2.5 and ingestion_method='hubspot'
      and measurement_status='observed' and verification_status='submitted'
  ) then raise exception 'Mapped transformation or trust state is incorrect'; end if;
  if (select count(*) from public.measurement_source_ingestion_events where source_record_id='ticket-day-2026-11-25') <> 1 then
    raise exception 'Mapped ingestion event was duplicated';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e4100000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.measurement_sources) <> 1
     or (select count(*) from public.measurement_source_mappings) <> 1
     or (select count(*) from public.metric_observations where metric_id='e4130000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Client-safe source, mapping, or published observation is missing';
  end if;
  if exists(select 1 from public.measurement_source_ingestion_events) then
    raise exception 'Client can read source ingestion internals';
  end if;
end $$;
select set_config('request.jwt.claim.sub','e4100000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.measurement_sources)
     or exists(select 1 from public.measurement_source_mappings)
     or exists(select 1 from public.metric_observations) then
    raise exception 'Cross-tenant mapped measurement read succeeded';
  end if;
end $$;
reset role;

rollback;
select 'Stage 4C mapping, normalized ingestion, transformation, idempotency, publication, and tenant assertions passed (fixtures rolled back)' as result;
