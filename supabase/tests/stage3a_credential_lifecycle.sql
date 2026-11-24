-- Run with an administrative connection. All fixtures are rolled back.
begin;

insert into auth.users (id,email) values
  ('b3600000-0000-4000-8000-000000000001','stage3a-credential-owner@example.invalid'),
  ('b3600000-0000-4000-8000-000000000002','stage3a-credential-foreign@example.invalid');
insert into public.organizations (id,name) values
  ('b3610000-0000-4000-8000-000000000001','Stage 3A credential tenant'),
  ('b3610000-0000-4000-8000-000000000002','Stage 3A foreign tenant');
insert into public.organization_memberships (id,organization_id,user_id,role,status) values
  ('b3620000-0000-4000-8000-000000000001','b3610000-0000-4000-8000-000000000001','b3600000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('b3620000-0000-4000-8000-000000000002','b3610000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000002','delaro_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','b3600000-0000-4000-8000-000000000001',true);
select public.register_monitored_workflow(
  'b3610000-0000-4000-8000-000000000001','n8n_cloud','credential-test.app.n8n.cloud',
  'credential-lifecycle','Credential lifecycle test',
  'https://credential-test.app.n8n.cloud/workflow/credential-lifecycle',null,
  null,null,null,null,false,
  'b3630000-0000-4000-8000-000000000001',repeat('a',64),'oldhint1',
  'Old reporter',120
);

select public.rotate_workflow_ingestion_credential(
  (select id from public.implementation_workflows where external_workflow_id='credential-lifecycle'),
  'b3630000-0000-4000-8000-000000000002',repeat('b',64),'newhint2','New reporter',120,null
);

do $$
declare blocked boolean := false;
begin
  if (select status from public.workflow_ingestion_credentials where id='b3630000-0000-4000-8000-000000000001') <> 'revoked'
     or (select status from public.workflow_ingestion_credentials where id='b3630000-0000-4000-8000-000000000002') <> 'active'
  then raise exception 'Credential rotation did not revoke the prior credential'; end if;

  perform set_config('request.jwt.claim.sub','b3600000-0000-4000-8000-000000000002',true);
  begin
    perform public.revoke_workflow_ingestion_credential('b3630000-0000-4000-8000-000000000002');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Cross-tenant credential revocation succeeded'; end if;
end $$;
reset role;

do $$
declare blocked boolean := false; result jsonb;
begin
  begin
    perform public.ingest_n8n_execution_event(
      'b3630000-0000-4000-8000-000000000001',repeat('a',64),'old-event','old-run',
      'completed','successful',now(),now(),now(),1,null,null,'n8n_workflow_reporter',repeat('c',64));
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Rotated credential remained usable'; end if;

  select public.ingest_n8n_execution_event(
    'b3630000-0000-4000-8000-000000000002',repeat('b',64),'new-event','new-run',
    'completed','successful',now(),now(),now(),1,null,null,'n8n_workflow_reporter',repeat('d',64)
  ) into result;
  if result->>'accepted' <> 'true' then raise exception 'Replacement credential was rejected'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b3600000-0000-4000-8000-000000000001',true);
select public.revoke_workflow_ingestion_credential('b3630000-0000-4000-8000-000000000002');
reset role;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.ingest_n8n_execution_event(
      'b3630000-0000-4000-8000-000000000002',repeat('b',64),'revoked-event','revoked-run',
      'completed','successful',now(),now(),now(),1,null,null,'n8n_workflow_reporter',repeat('e',64));
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Revoked credential remained usable'; end if;
end $$;

rollback;
select 'Stage 3A credential rotation, revocation, and tenant assertions passed (fixtures rolled back)' as result;
