-- Run with an administrative connection. All fixtures are rolled back.
begin;

insert into auth.users (id,email) values
  ('b3500000-0000-4000-8000-000000000001','stage3b-internal-a@example.invalid'),
  ('b3500000-0000-4000-8000-000000000002','stage3b-client-a@example.invalid'),
  ('b3500000-0000-4000-8000-000000000003','stage3b-internal-b@example.invalid'),
  ('b3500000-0000-4000-8000-000000000004','stage3b-client-b@example.invalid');
insert into public.organizations (id,name) values
  ('b3510000-0000-4000-8000-000000000001','Stage 3B tenant A'),
  ('b3510000-0000-4000-8000-000000000002','Stage 3B tenant B');
insert into public.organization_memberships (id,organization_id,user_id,role,status) values
  ('b3520000-0000-4000-8000-000000000001','b3510000-0000-4000-8000-000000000001','b3500000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('b3520000-0000-4000-8000-000000000002','b3510000-0000-4000-8000-000000000001','b3500000-0000-4000-8000-000000000002','client_admin','active'),
  ('b3520000-0000-4000-8000-000000000003','b3510000-0000-4000-8000-000000000002','b3500000-0000-4000-8000-000000000003','delaro_admin','active'),
  ('b3520000-0000-4000-8000-000000000004','b3510000-0000-4000-8000-000000000002','b3500000-0000-4000-8000-000000000004','client_admin','active');

create temporary table stage3b_ids (workflow_id uuid primary key);
grant select,insert on stage3b_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','b3500000-0000-4000-8000-000000000001',true);
insert into stage3b_ids
select public.register_monitored_workflow(
  'b3510000-0000-4000-8000-000000000001','n8n_cloud','stage3b.app.n8n.cloud',
  'standalone-stage3b','Standalone Stage 3B workflow',
  'https://stage3b.app.n8n.cloud/workflow/standalone-stage3b',null,
  null,null,null,null,true,
  'b3570000-0000-4000-8000-000000000001',repeat('a',64),'testhint',
  'Stage 3B reporter',120
);

do $$
declare blocked boolean := false;
begin
  if not exists (
    select 1 from public.implementation_workflows workflow
    where workflow.id=(select workflow_id from stage3b_ids)
      and workflow.implementation_id is null
      and workflow.registration_source='direct'
      and workflow.monitoring_status='configured'
  ) then raise exception 'Standalone workflow registration failed'; end if;
  if not exists (
    select 1 from public.workflow_ingestion_credentials credential
    where credential.workflow_id=(select workflow_id from stage3b_ids)
      and credential.secret_hash=repeat('a',64)
      and credential.status='active'
  ) then raise exception 'Atomic reporter credential creation failed'; end if;

  begin
    update public.implementation_workflows set monitoring_status='connected'
    where id=(select workflow_id from stage3b_ids);
  exception when check_violation then blocked := true; end;
  if not blocked then raise exception 'Workflow was marked connected without execution evidence'; end if;
end $$;

-- A Delaro user in another tenant cannot register against tenant A.
select set_config('request.jwt.claim.sub','b3500000-0000-4000-8000-000000000003',true);
do $$
declare blocked boolean := false;
begin
  begin
    perform public.register_monitored_workflow(
      'b3510000-0000-4000-8000-000000000001','n8n_cloud','foreign.app.n8n.cloud',
      'foreign-workflow','Foreign workflow','https://foreign.app.n8n.cloud/workflow/foreign-workflow',null,
      null,null,null,null,true,
      'b3570000-0000-4000-8000-000000000002',repeat('b',64),'othertst',
      'Foreign reporter',120
    );
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Cross-tenant direct registration succeeded'; end if;
end $$;
reset role;

-- A genuine authenticated event earns connected state; the newest failure
-- changes it to degraded.
do $$
declare result jsonb;
begin
  select public.ingest_n8n_execution_event(
    'b3570000-0000-4000-8000-000000000001',repeat('a',64),'first-success','run-1',
    'completed','successful',now(),now()-interval '2 seconds',now(),2000,null,null,
    'n8n_workflow_reporter',repeat('c',64)
  ) into result;
  if result->>'accepted' <> 'true'
     or (select monitoring_status from public.implementation_workflows where id=(select workflow_id from stage3b_ids)) <> 'connected'
  then raise exception 'Authenticated execution did not connect the workflow'; end if;

  perform public.ingest_n8n_execution_event(
    'b3570000-0000-4000-8000-000000000001',repeat('a',64),'latest-failure','run-2',
    'failed','failed',now()+interval '1 second',now(),now()+interval '1 second',1000,'TEST_FAILURE','Test-only failure',
    'n8n_error_trigger',repeat('d',64)
  );
  if (select monitoring_status from public.implementation_workflows where id=(select workflow_id from stage3b_ids)) <> 'degraded'
  then raise exception 'Latest authenticated failure did not degrade the workflow'; end if;
end $$;

-- Existing implementation-linked workflows remain valid and client-visible.
set local role authenticated;
select set_config('request.jwt.claim.sub','b3500000-0000-4000-8000-000000000001',true);
insert into public.opportunities (
  id,organization_id,title,department_or_process,current_state_problem,business_consequence,
  financial_impact_score,frequency_score,addressability_score,measurement_quality_score,
  strategic_leverage_score,implementation_difficulty_score,organizational_complexity_score,risk_score,opportunity_score
) values (
  'b3530000-0000-4000-8000-000000000001','b3510000-0000-4000-8000-000000000001',
  'Stage 3B compatibility opportunity','Testing','Compatibility requires proof','Existing records must continue working',3,3,3,3,3,3,3,3,24
);
insert into public.initiatives (id,organization_id,opportunity_id,title,objective,client_visible) values (
  'b3540000-0000-4000-8000-000000000001','b3510000-0000-4000-8000-000000000001',
  'b3530000-0000-4000-8000-000000000001','Stage 3B compatibility improvement','Preserve old workflow links',true
);
insert into public.implementations (
  id,organization_id,initiative_id,name,implementation_type,operational_problem,desired_outcome,
  client_solution_summary,client_progress_summary,client_visible,created_by_membership_id,updated_by_membership_id
) values (
  'b3550000-0000-4000-8000-000000000001','b3510000-0000-4000-8000-000000000001',
  'b3540000-0000-4000-8000-000000000001','Legacy linked implementation','n8n_automation',
  'Compatibility requires a linked record','Keep linked monitoring available','Compatibility test','Registered',true,
  'b3520000-0000-4000-8000-000000000001','b3520000-0000-4000-8000-000000000001'
);
insert into public.implementation_workflows (
  id,organization_id,implementation_id,platform,instance_reference,external_workflow_id,
  workflow_name,purpose,environment,operational_status,monitoring_status,client_visible
) values (
  'b3560000-0000-4000-8000-000000000001','b3510000-0000-4000-8000-000000000001',
  'b3550000-0000-4000-8000-000000000001','n8n','Legacy test instance','legacy-stage3b',
  'Legacy linked workflow','Compatibility fixture','staging','active','configured',true
);

select set_config('request.jwt.claim.sub','b3500000-0000-4000-8000-000000000002',true);
do $$
begin
  if (select count(*) from public.get_client_workflow_monitoring('b3510000-0000-4000-8000-000000000001')) <> 2
  then raise exception 'Client cannot see both standalone and implementation-linked workflows'; end if;
  if (select count(*) from public.workflow_executions where workflow_id=(select workflow_id from stage3b_ids)) <> 2
  then raise exception 'Authorized client cannot read standalone execution history'; end if;
  if exists(select 1 from public.workflow_ingestion_credentials)
  then raise exception 'Client can read reporter credentials'; end if;
end $$;

select set_config('request.jwt.claim.sub','b3500000-0000-4000-8000-000000000004',true);
do $$
begin
  if exists(select 1 from public.get_client_workflow_monitoring('b3510000-0000-4000-8000-000000000001'))
     or exists(select 1 from public.workflow_executions)
  then raise exception 'Cross-tenant workflow visibility succeeded'; end if;
end $$;
reset role;

rollback;
select 'Stage 3B standalone registration, telemetry state, compatibility, credential privacy, and tenant assertions passed (fixtures rolled back)' as result;
