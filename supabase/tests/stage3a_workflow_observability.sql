-- Run with an administrative connection. All fixtures and execution events are rolled back.
begin;

insert into auth.users (id,email) values
  ('b3400000-0000-4000-8000-000000000001','stage3a-internal@example.invalid'),
  ('b3400000-0000-4000-8000-000000000002','stage3a-client-a@example.invalid'),
  ('b3400000-0000-4000-8000-000000000003','stage3a-client-b@example.invalid'),
  ('b3400000-0000-4000-8000-000000000004','stage3a-suspended@example.invalid');
insert into public.organizations (id,name) values
  ('b3410000-0000-4000-8000-000000000001','Stage 3A test tenant A'),
  ('b3410000-0000-4000-8000-000000000002','Stage 3A test tenant B');
insert into public.organization_memberships (id,organization_id,user_id,role,status) values
  ('b3420000-0000-4000-8000-000000000001','b3410000-0000-4000-8000-000000000001','b3400000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('b3420000-0000-4000-8000-000000000002','b3410000-0000-4000-8000-000000000001','b3400000-0000-4000-8000-000000000002','client_admin','active'),
  ('b3420000-0000-4000-8000-000000000003','b3410000-0000-4000-8000-000000000002','b3400000-0000-4000-8000-000000000003','client_admin','active'),
  ('b3420000-0000-4000-8000-000000000004','b3410000-0000-4000-8000-000000000001','b3400000-0000-4000-8000-000000000004','client_user','suspended');

set local role authenticated;
select set_config('request.jwt.claim.sub','b3400000-0000-4000-8000-000000000001',true);
insert into public.opportunities (
  id,organization_id,title,department_or_process,current_state_problem,business_consequence,
  financial_impact_score,frequency_score,addressability_score,measurement_quality_score,
  strategic_leverage_score,implementation_difficulty_score,organizational_complexity_score,risk_score,opportunity_score
) values (
  'b3430000-0000-4000-8000-000000000001','b3410000-0000-4000-8000-000000000001',
  'Stage 3A test opportunity','Test process','Test-only workflow lacks monitoring',
  'Test-only executions are not visible',3,3,3,3,3,3,3,3,24
);
insert into public.initiatives (id,organization_id,opportunity_id,title,objective,client_visible) values (
  'b3440000-0000-4000-8000-000000000001','b3410000-0000-4000-8000-000000000001',
  'b3430000-0000-4000-8000-000000000001','Stage 3A test improvement','Verify execution observability',true
);
insert into public.implementations (
  id,organization_id,initiative_id,name,implementation_type,operational_problem,desired_outcome,
  client_solution_summary,client_progress_summary,client_visible,created_by_membership_id,updated_by_membership_id
) values (
  'b3450000-0000-4000-8000-000000000001','b3410000-0000-4000-8000-000000000001',
  'b3440000-0000-4000-8000-000000000001','Stage 3A n8n test implementation','n8n_automation',
  'Test executions require authenticated monitoring','Show safe workflow outcomes to the authorized client',
  'Test-only published summary','Test-only monitoring setup',true,
  'b3420000-0000-4000-8000-000000000001','b3420000-0000-4000-8000-000000000001'
);
insert into public.implementation_workflows (
  id,organization_id,implementation_id,platform,instance_reference,external_workflow_id,
  workflow_name,purpose,environment,operational_status,monitoring_status,client_visible
) values (
  'b3460000-0000-4000-8000-000000000001','b3410000-0000-4000-8000-000000000001',
  'b3450000-0000-4000-8000-000000000001','n8n','Disposable test instance','stage3a-test-workflow',
  'Stage 3A execution test','Verify authenticated event reporting','staging','active','configured',true
);

select public.rotate_workflow_ingestion_credential(
  'b3460000-0000-4000-8000-000000000001','b3470000-0000-4000-8000-000000000001',
  repeat('a',64),'testhint','Stage 3A SQL reporter',4,null
);
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $$
declare result jsonb; blocked boolean;
begin
  blocked := false;
  begin
    perform public.ingest_n8n_execution_event(
      'b3470000-0000-4000-8000-000000000001',repeat('b',64),'bad-event','bad-run',
      'completed','successful',now(),now(),now(),1,null,null,'n8n_workflow_reporter',repeat('b',64));
  exception when insufficient_privilege then blocked := true; end;
  if not blocked or exists(select 1 from public.workflow_executions where external_execution_id='bad-run') then
    raise exception 'Invalid credential was accepted'; end if;

  select public.ingest_n8n_execution_event(
    'b3470000-0000-4000-8000-000000000001',repeat('a',64),'success-event','success-run',
    'completed','successful',now(),now()-interval '2 seconds',now(),2000,null,null,
    'n8n_workflow_reporter',repeat('c',64)) into result;
  if result->>'duplicate' <> 'false' then raise exception 'First event was treated as duplicate'; end if;

  select public.ingest_n8n_execution_event(
    'b3470000-0000-4000-8000-000000000001',repeat('a',64),'success-event','success-run',
    'completed','successful',now(),now()-interval '2 seconds',now(),2000,null,null,
    'n8n_workflow_reporter',repeat('c',64)) into result;
  if result->>'duplicate' <> 'true' then raise exception 'Duplicate event was not identified'; end if;

  perform public.ingest_n8n_execution_event(
    'b3470000-0000-4000-8000-000000000001',repeat('a',64),'late-start-event','success-run',
    'started','running',now()+interval '1 second',now()-interval '2 seconds',null,null,null,null,
    'n8n_workflow_reporter',repeat('d',64));
  if (select status from public.workflow_executions where external_execution_id='success-run') <> 'successful' then
    raise exception 'Late event regressed terminal execution state'; end if;

  perform public.ingest_n8n_execution_event(
    'b3470000-0000-4000-8000-000000000001',repeat('a',64),'failure-event','failure-run',
    'failed','failed',now(),now()-interval '3 seconds',now(),3000,'SOURCE_TIMEOUT',
    'Source system did not respond before the configured timeout.','n8n_error_trigger',repeat('e',64));
  if (select count(*) from public.workflow_executions) <> 2
     or (select count(*) from public.workflow_execution_events) <> 3 then
    raise exception 'Execution aggregation or immutable event history is incorrect'; end if;

  blocked := false;
  begin
    perform public.ingest_n8n_execution_event(
      'b3470000-0000-4000-8000-000000000001',repeat('a',64),'rate-event','rate-run',
      'completed','successful',now(),now(),now(),1,null,null,'n8n_workflow_reporter',repeat('f',64));
  exception when program_limit_exceeded then blocked := true; end;
  if not blocked then raise exception 'Credential rate limit was not enforced'; end if;

  blocked := false;
  begin
    update public.implementations set name='Service role attempted lifecycle edit'
      where id='b3450000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Service telemetry bypass allowed a non-telemetry implementation update'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare blocked boolean;
begin
  perform set_config('request.jwt.claim.sub','b3400000-0000-4000-8000-000000000002',true);
  if (select count(*) from public.workflow_executions) <> 2
     or (select count(*) from public.get_client_workflow_monitoring('b3410000-0000-4000-8000-000000000001')) <> 1 then
    raise exception 'Authorized client workflow visibility failed'; end if;
  if exists(select 1 from public.workflow_execution_events)
     or exists(select 1 from public.workflow_ingestion_credentials) then
    raise exception 'Client can read private workflow integration records'; end if;
  blocked := false;
  begin
    insert into public.workflow_executions (
      organization_id,workflow_id,external_execution_id,status,monitoring_source,first_event_at,last_event_at
    ) values (
      'b3410000-0000-4000-8000-000000000001','b3460000-0000-4000-8000-000000000001',
      'forged-run','successful','n8n_workflow_reporter',now(),now());
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Client directly inserted an execution'; end if;

  perform set_config('request.jwt.claim.sub','b3400000-0000-4000-8000-000000000003',true);
  if exists(select 1 from public.workflow_executions)
     or exists(select 1 from public.get_client_workflow_monitoring('b3410000-0000-4000-8000-000000000001')) then
    raise exception 'Cross-tenant execution read succeeded'; end if;

  perform set_config('request.jwt.claim.sub','b3400000-0000-4000-8000-000000000004',true);
  if exists(select 1 from public.workflow_executions) then raise exception 'Suspended user retained workflow access'; end if;
end $$;
reset role;

rollback;
select 'Stage 3A ingestion, idempotency, ordering, rate limit, privacy, and tenant assertions passed (fixtures rolled back)' as result;
