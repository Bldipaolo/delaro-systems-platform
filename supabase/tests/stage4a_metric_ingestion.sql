-- Run with an administrative connection. All fixtures are rolled back.
begin;

insert into auth.users(id,email) values
  ('c4000000-0000-4000-8000-000000000001','stage4a-internal@example.invalid'),
  ('c4000000-0000-4000-8000-000000000002','stage4a-client@example.invalid'),
  ('c4000000-0000-4000-8000-000000000003','stage4a-foreign@example.invalid');
insert into public.organizations(id,name) values
  ('c4010000-0000-4000-8000-000000000001','Stage 4A tenant'),
  ('c4010000-0000-4000-8000-000000000002','Stage 4A foreign tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('c4020000-0000-4000-8000-000000000001','c4010000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('c4020000-0000-4000-8000-000000000002','c4010000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','client_admin','active'),
  ('c4020000-0000-4000-8000-000000000003','c4010000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000003','client_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',true);
select public.register_monitored_workflow(
  'c4010000-0000-4000-8000-000000000001','n8n_cloud','stage4a.app.n8n.cloud','stage4a-workflow','Stage 4A workflow',
  'https://stage4a.app.n8n.cloud/workflow/stage4a-workflow',null,null,null,null,null,true,
  'c4030000-0000-4000-8000-000000000001',repeat('a',64),'execsink','Execution reporter',120
);
insert into public.measurement_metrics(id,organization_id,name,unit,improvement_direction,metric_type,client_visible,auto_publish_observations)
values('c4040000-0000-4000-8000-000000000001','c4010000-0000-4000-8000-000000000001','Processing duration','seconds','decrease','duration',true,true);
insert into public.workflow_metrics(organization_id,workflow_id,metric_id,relationship)
select 'c4010000-0000-4000-8000-000000000001',id,'c4040000-0000-4000-8000-000000000001','Execution duration'
from public.implementation_workflows where external_workflow_id='stage4a-workflow';
select public.rotate_metric_ingestion_credential(
  'c4040000-0000-4000-8000-000000000001',
  (select id from public.implementation_workflows where external_workflow_id='stage4a-workflow'),
  'c4050000-0000-4000-8000-000000000001',repeat('b',64),'metrics1','Metric reporter',60
);
reset role;

do $$
declare first_result jsonb; duplicate_result jsonb;
begin
  first_result := public.ingest_metric_observation('c4050000-0000-4000-8000-000000000001',repeat('b',64),'duration-1',12.5,'seconds',now(),current_date,current_date,1,'single execution','n8n run 1','n8n_metric_reporter',repeat('c',64));
  duplicate_result := public.ingest_metric_observation('c4050000-0000-4000-8000-000000000001',repeat('b',64),'duration-1',99,'seconds',now(),current_date,current_date,1,'single execution','n8n run 1','n8n_metric_reporter',repeat('d',64));
  if first_result->>'duplicate' <> 'false' or duplicate_result->>'duplicate' <> 'true' then raise exception 'Metric idempotency failed'; end if;
  if (select count(*) from public.metric_observations where external_event_id='duration-1') <> 1 then raise exception 'Duplicate observation was stored'; end if;
  if exists(select 1 from public.metric_observations where external_event_id='duration-1' and (measurement_status<>'observed' or verification_status<>'submitted')) then raise exception 'Automated trust state is incorrect'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.metric_observations where metric_id='c4040000-0000-4000-8000-000000000001') <> 1 then raise exception 'Published observed value is not visible to the tenant client'; end if;
  if exists(select 1 from public.metric_ingestion_credentials) or exists(select 1 from public.metric_ingestion_events) then raise exception 'Client can read ingestion internals'; end if;
end $$;
select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.metric_observations) or exists(select 1 from public.measurement_metrics) then raise exception 'Cross-tenant metric read succeeded'; end if;
end $$;
reset role;

rollback;
select 'Stage 4A metric ingestion, idempotency, trust-state, credential privacy, and tenant assertions passed (fixtures rolled back)' as result;
