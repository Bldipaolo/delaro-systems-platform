-- Run with an administrative SQL connection against a disposable/test project.
-- Every fixture, including transient auth users, is rolled back.
begin;

insert into auth.users (id,email) values
  ('a3100000-0000-4000-8000-000000000001','pilot-internal@example.invalid'),
  ('a3100000-0000-4000-8000-000000000002','pilot-client-a@example.invalid'),
  ('a3100000-0000-4000-8000-000000000003','pilot-client-b@example.invalid'),
  ('a3100000-0000-4000-8000-000000000004','pilot-readonly@example.invalid'),
  ('a3100000-0000-4000-8000-000000000005','pilot-client-user@example.invalid');
insert into public.organizations (id,name) values
  ('a3110000-0000-4000-8000-000000000001','Pilot test tenant A'),
  ('a3110000-0000-4000-8000-000000000002','Pilot test tenant B');
insert into public.organization_memberships (id,organization_id,user_id,role) values
  ('a3120000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000001','delaro_admin'),
  ('a3120000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002','client_admin'),
  ('a3120000-0000-4000-8000-000000000003','a3110000-0000-4000-8000-000000000002','a3100000-0000-4000-8000-000000000003','client_admin'),
  ('a3120000-0000-4000-8000-000000000004','a3110000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000004','read_only'),
  ('a3120000-0000-4000-8000-000000000005','a3110000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000005','client_user');
insert into public.operational_areas (id,organization_id,name) values
  ('a3130000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001','Test A area'),
  ('a3130000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000002','Test B area');
insert into public.processes (id,organization_id,operational_area_id,name,client_visible) values
  ('a3140000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001','a3130000-0000-4000-8000-000000000001','Published A',true),
  ('a3140000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000001','a3130000-0000-4000-8000-000000000001','Internal A',false),
  ('a3140000-0000-4000-8000-000000000003','a3110000-0000-4000-8000-000000000002','a3130000-0000-4000-8000-000000000002','Published B',true);
insert into public.measurement_metrics (id,organization_id,process_id,name,unit,improvement_direction,client_visible) values
  ('a3150000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001','a3140000-0000-4000-8000-000000000001','Test metric','minutes','decrease',true);
insert into public.measurement_evidence (id,organization_id,metric_id,source_type,source_reference,verification_status,client_visible) values
  ('a3160000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001','a3150000-0000-4000-8000-000000000001','system_export','Test fixture export','submitted',true);
insert into public.opportunities (id,organization_id,title,department_or_process,current_state_problem,
  business_consequence,financial_impact_score,frequency_score,addressability_score,
  measurement_quality_score,strategic_leverage_score,implementation_difficulty_score,
  organizational_complexity_score,risk_score,opportunity_score) values
  ('a3210000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001',
    'Synthetic test opportunity','Test process','Only a test fixture','Only a test consequence',
    3,3,3,3,3,3,3,3,24);
insert into public.process_constraints (id,organization_id,process_id,issue_description,severity,frequency,client_visible)
  values ('a3270000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001',
    'a3140000-0000-4000-8000-000000000001','Synthetic mapped constraint','high','frequent',true);
insert into public.constraint_diagnostics (constraint_id,organization_id,root_cause,business_consequence,opportunity_id,internal_notes)
  values ('a3270000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001',
    'Synthetic internal root cause','Synthetic business consequence','a3210000-0000-4000-8000-000000000001',
    'Private diagnostic note');
insert into public.initiatives (id,organization_id,opportunity_id,title,objective,client_visible) values
  ('a3220000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001',
    'a3210000-0000-4000-8000-000000000001','Synthetic test improvement',
    'Test that private drafts stay hidden until publication',false);
insert into public.initiative_internal_details (initiative_id,organization_id,scope_internal)
  values ('a3220000-0000-4000-8000-000000000001',
    'a3110000-0000-4000-8000-000000000001','Private test scope');
insert into public.value_models (id,organization_id,initiative_id,name,category,formula_kind,
  calculation_method,annualization_basis,benefit_stream_key) values
  ('a3230000-0000-4000-8000-000000000001',
    'a3110000-0000-4000-8000-000000000001',
    'a3220000-0000-4000-8000-000000000001',
    'Synthetic test value model','labor_savings','product',
    'Test factors multiplied','Test period','synthetic_test_stream');
insert into public.value_model_inputs (organization_id,model_id,input_key,label,role,value,unit,origin,
  source_description,client_visible) values
  ('a3110000-0000-4000-8000-000000000001','a3230000-0000-4000-8000-000000000001',
    'units','Test units','factor',2,'units','known','Synthetic test source',true),
  ('a3110000-0000-4000-8000-000000000001','a3230000-0000-4000-8000-000000000001',
    'rate','Test rate','factor',3,'USD/unit','known','Synthetic test source',true);
insert into public.value_evidence (id,organization_id,model_id,source_type,source_reference,
  verification_status,client_visible) values
  ('a3240000-0000-4000-8000-000000000001',
    'a3110000-0000-4000-8000-000000000001',
    'a3230000-0000-4000-8000-000000000001',
    'system_export','Synthetic test export','submitted',true);
insert into storage.objects (bucket_id,name) values
  ('client-documents','a3110000-0000-4000-8000-000000000001/a3170000-0000-4000-8000-000000000001.pdf'),
  ('client-documents','a3110000-0000-4000-8000-000000000001/a3170000-0000-4000-8000-000000000002.pdf'),
  ('client-documents','a3110000-0000-4000-8000-000000000002/a3170000-0000-4000-8000-000000000003.pdf');
insert into public.client_documents (organization_id,storage_path,file_name,mime_type,size_bytes,visibility,uploaded_by_membership_id) values
  ('a3110000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001/a3170000-0000-4000-8000-000000000001.pdf','Shared A.pdf','application/pdf',10,'client','a3120000-0000-4000-8000-000000000001'),
  ('a3110000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000001/a3170000-0000-4000-8000-000000000002.pdf','Private A.pdf','application/pdf',10,'internal','a3120000-0000-4000-8000-000000000001'),
  ('a3110000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000002/a3170000-0000-4000-8000-000000000003.pdf','Shared B.pdf','application/pdf',10,'client','a3120000-0000-4000-8000-000000000003');

-- Force a membership failure for one synthetic provisioning request so the
-- test can prove the organization insert rolls back with it.
create function private.reject_test_owner_membership() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id = 'a3110000-0000-4000-8000-000000000005' then
    raise exception 'Synthetic owner membership failure';
  end if;
  return new;
end $$;
create trigger reject_test_owner_membership
  before insert on public.organization_memberships
  for each row execute function private.reject_test_owner_membership();

set local role authenticated;
do $$
declare affected integer; stamped uuid; blocked boolean; gated_phase public.initiative_phase;
begin
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000002',true);
  if (select count(*) from public.organizations where id in
      ('a3110000-0000-4000-8000-000000000001','a3110000-0000-4000-8000-000000000002')) <> 1 then
    raise exception 'Client A organization isolation failed'; end if;
  if (select count(*) from public.processes where id in
      ('a3140000-0000-4000-8000-000000000001','a3140000-0000-4000-8000-000000000002','a3140000-0000-4000-8000-000000000003')) <> 1 then
    raise exception 'Client A process publication/isolation failed'; end if;
  if exists(select 1 from public.measurement_evidence where id='a3160000-0000-4000-8000-000000000001') then
    raise exception 'Client A can see unverified evidence'; end if;
  if not exists(select 1 from public.process_constraints where id='a3270000-0000-4000-8000-000000000001')
    or exists(select 1 from public.constraint_diagnostics where constraint_id='a3270000-0000-4000-8000-000000000001') then
    raise exception 'Published constraint or private diagnostic boundary failed'; end if;
  if exists(select 1 from public.initiatives where id='a3220000-0000-4000-8000-000000000001')
    or exists(select 1 from public.initiative_internal_details where initiative_id='a3220000-0000-4000-8000-000000000001')
    or exists(select 1 from public.value_models where id='a3230000-0000-4000-8000-000000000001') then
    raise exception 'Client A can see a private improvement or value draft'; end if;
  if (select count(*) from public.client_documents) <> 1
    or (select count(*) from storage.objects where bucket_id='client-documents') <> 1 then
    raise exception 'Client A document privacy failed'; end if;
  insert into storage.objects (bucket_id,name) values
    ('client-documents','a3110000-0000-4000-8000-000000000001/a3170000-0000-4000-8000-000000000004.pdf');
  blocked := false;
  begin
    insert into storage.objects (bucket_id,name) values
      ('client-documents','a3110000-0000-4000-8000-000000000002/a3170000-0000-4000-8000-000000000005.pdf');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Client A uploaded into tenant B storage path'; end if;
  blocked := false;
  begin
    insert into public.client_documents (organization_id,storage_path,file_name,mime_type,size_bytes,visibility,uploaded_by_membership_id)
      values ('a3110000-0000-4000-8000-000000000001',
        'a3110000-0000-4000-8000-000000000001/a3170000-0000-4000-8000-000000000004.pdf',
        'Forged internal.pdf','application/pdf',10,'internal','a3120000-0000-4000-8000-000000000002');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Client A registered an internal-only document'; end if;
  update public.measurement_evidence set verification_status='verified'
    where id='a3160000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Client A reviewed evidence'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000003',true);
  if (select count(*) from public.processes where id in
      ('a3140000-0000-4000-8000-000000000001','a3140000-0000-4000-8000-000000000003')) <> 1 then
    raise exception 'Client B tenant isolation failed'; end if;
  if (select count(*) from public.client_documents) <> 1
    or (select count(*) from storage.objects where bucket_id='client-documents') <> 1 then
    raise exception 'Client B document tenant isolation failed'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000004',true);
  update public.processes set name='Should not change' where id='a3140000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Read-only member edited process'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000001',true);
  if (select count(*) from public.client_documents) <> 2
    or (select count(*) from storage.objects where bucket_id='client-documents') <> 2 then
    raise exception 'Internal A document access failed'; end if;
  update public.measurement_evidence set verification_status='verified',
    verified_by_membership_id='a3120000-0000-4000-8000-000000000003',
    verified_at='2020-01-01' where id='a3160000-0000-4000-8000-000000000001';
  select verified_by_membership_id into stamped from public.measurement_evidence
    where id='a3160000-0000-4000-8000-000000000001';
  if stamped <> 'a3120000-0000-4000-8000-000000000001' then
    raise exception 'Evidence reviewer was not database-derived'; end if;
  blocked := false;
  begin
    update public.measurement_evidence set source_reference='rewritten'
      where id='a3160000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Verified evidence remained mutable'; end if;

  insert into public.metric_baselines (organization_id,metric_id,value,evidence_id,verification_status)
    values ('a3110000-0000-4000-8000-000000000001','a3150000-0000-4000-8000-000000000001',12,
      'a3160000-0000-4000-8000-000000000001','submitted');
  update public.metric_baselines set verification_status='verified',
    verified_by_membership_id='a3120000-0000-4000-8000-000000000003'
    where metric_id='a3150000-0000-4000-8000-000000000001';
  select verified_by_membership_id into stamped from public.metric_baselines
    where metric_id='a3150000-0000-4000-8000-000000000001';
  if stamped <> 'a3120000-0000-4000-8000-000000000001' then
    raise exception 'Baseline reviewer was not database-derived'; end if;
  blocked := false;
  begin
    update public.metric_baselines set value=13 where metric_id='a3150000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Verified baseline remained mutable'; end if;

  update public.initiatives set client_visible=true,client_visible_summary='Reviewed synthetic test summary'
    where id='a3220000-0000-4000-8000-000000000001';
  update public.value_models set status='active',client_visible=true
    where id='a3230000-0000-4000-8000-000000000001';
  update public.value_evidence set verification_status='verified',
    verified_by_membership_id='a3120000-0000-4000-8000-000000000003'
    where id='a3240000-0000-4000-8000-000000000001';
  insert into public.value_realization_snapshots
    (id,organization_id,model_id,period_start,period_end,measured_at,
      realized_units,unit_value,unit_label,evidence_id,verification_status)
    values ('a3250000-0000-4000-8000-000000000001',
      'a3110000-0000-4000-8000-000000000001',
      'a3230000-0000-4000-8000-000000000001',
      current_date-1,current_date,now(),2,3,'test units',
      'a3240000-0000-4000-8000-000000000001','submitted');
  update public.value_realization_snapshots set verification_status='verified',
    verified_by_membership_id='a3120000-0000-4000-8000-000000000003'
    where id='a3250000-0000-4000-8000-000000000001';
  select verified_by_membership_id into stamped from public.value_realization_snapshots
    where id='a3250000-0000-4000-8000-000000000001';
  if stamped <> 'a3120000-0000-4000-8000-000000000001' then
    raise exception 'Realized value reviewer was not database-derived'; end if;
  blocked := false;
  begin
    update public.value_realization_snapshots set realized_units=999
      where id='a3250000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Verified realized value remained mutable'; end if;
  update public.value_models set aggregation_approved_at='2020-01-01',
    aggregation_approved_by_membership_id='a3120000-0000-4000-8000-000000000003'
    where id='a3230000-0000-4000-8000-000000000001';
  select aggregation_approved_by_membership_id into stamped from public.value_models
    where id='a3230000-0000-4000-8000-000000000001';
  if stamped <> 'a3120000-0000-4000-8000-000000000001' then
    raise exception 'Value aggregation approver was not database-derived'; end if;
  blocked := false;
  begin
    update public.value_models set recoverable_percentage=100
      where id='a3230000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Approved economic model remained mutable'; end if;
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000002',true);
  if not exists(select 1 from public.initiatives where id='a3220000-0000-4000-8000-000000000001')
    or not exists(select 1 from public.value_realization_snapshots where id='a3250000-0000-4000-8000-000000000001')
    or exists(select 1 from public.initiative_internal_details where initiative_id='a3220000-0000-4000-8000-000000000001') then
    raise exception 'Client publication or private scope boundary failed'; end if;
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000001',true);

  insert into public.decisions (id,organization_id,initiative_id,kind,title,context,why_needed,
    requested_from_membership_id,requested_by_membership_id,client_visible)
    values ('a3180000-0000-4000-8000-000000000001',
      'a3110000-0000-4000-8000-000000000001','a3220000-0000-4000-8000-000000000001','approval',
      'Test source confirmation','Test client selection','Human approval is required',
      'a3120000-0000-4000-8000-000000000002',
      'a3120000-0000-4000-8000-000000000001',true);
  insert into public.decision_options (id,organization_id,decision_id,title,client_visible)
    values ('a3190000-0000-4000-8000-000000000001',
      'a3110000-0000-4000-8000-000000000001',
      'a3180000-0000-4000-8000-000000000001','Confirm test source',true);
  insert into public.approvals (id,organization_id,decision_id,requested_from_membership_id)
    values ('a3200000-0000-4000-8000-000000000001',
      'a3110000-0000-4000-8000-000000000001',
      'a3180000-0000-4000-8000-000000000001',
      'a3120000-0000-4000-8000-000000000002');
  foreach gated_phase in array array['Build','Test','Deploy','Measure']::public.initiative_phase[] loop
    blocked := false;
    begin
      update public.initiatives set current_phase=gated_phase
        where id='a3220000-0000-4000-8000-000000000001';
    exception when others then blocked := true; end;
    if not blocked then raise exception 'Improvement entered % before client approval', gated_phase; end if;
  end loop;
  blocked := false;
  begin
    update public.initiatives set status='Complete'
      where id='a3220000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Improvement completed before client approval'; end if;
  blocked := false;
  begin
    update public.decisions set status='approved',
      selected_option_id='a3190000-0000-4000-8000-000000000001',decided_at=now()
      where id='a3180000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Internal user bypassed human approval'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000002',true);
  update public.approvals set status='approved',
    selected_option_id='a3190000-0000-4000-8000-000000000001'
    where id='a3200000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.decisions where id='a3180000-0000-4000-8000-000000000001'
    and status='approved' and decided_at is not null) then
    raise exception 'Client approval did not record the decision'; end if;
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000001',true);
  update public.initiatives set current_phase='Build', status='Complete'
    where id='a3220000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.initiatives
    where id='a3220000-0000-4000-8000-000000000001'
      and current_phase='Build' and status='Complete') then
    raise exception 'Approved improvement could not enter implementation'; end if;
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000002',true);
  blocked := false;
  begin
    update public.approvals set response_note='Forged later change'
      where id='a3200000-0000-4000-8000-000000000001';
    get diagnostics affected = row_count;
    if affected = 0 then blocked := true; end if;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Answered client approval remained mutable'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000001',true);
  blocked := false;
  begin
    update public.approvals set status='pending'
      where id='a3200000-0000-4000-8000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Internal user silently reopened answered approval'; end if;

  -- Stage 1: ordinary authenticated writes can provision only from an existing Delaro admin context.
  perform public.provision_client_organization(
    'a3110000-0000-4000-8000-000000000003','Provisioned pilot tenant',null,null,null,null);
  perform public.provision_client_organization(
    'a3110000-0000-4000-8000-000000000003','Provisioned pilot tenant',null,null,null,null);
  if (select count(*) from public.organizations where id='a3110000-0000-4000-8000-000000000003') <> 1
    or (select count(*) from public.organization_memberships
      where organization_id='a3110000-0000-4000-8000-000000000003'
        and user_id='a3100000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Provisioning retry was not idempotent'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000002',true);
  blocked := false;
  begin
    perform public.provision_client_organization(
      'a3110000-0000-4000-8000-000000000004','Unauthorized pilot tenant',null,null,null,null);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Client administrator provisioned a tenant'; end if;

  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000001',true);
  blocked := false;
  begin
    perform public.provision_client_organization(
      'a3110000-0000-4000-8000-000000000005','Atomic failure tenant',null,null,null,null);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Synthetic provisioning failure unexpectedly succeeded'; end if;

  -- Valid direct operating scope works, while a cross-tenant process reference is rejected by composite FK.
  insert into public.initiative_processes (organization_id,initiative_id,process_id,relationship)
    values ('a3110000-0000-4000-8000-000000000001','a3220000-0000-4000-8000-000000000001',
      'a3140000-0000-4000-8000-000000000001','Primary process');
  blocked := false;
  begin
    insert into public.initiative_processes (organization_id,initiative_id,process_id,relationship)
      values ('a3110000-0000-4000-8000-000000000001','a3220000-0000-4000-8000-000000000001',
        'a3140000-0000-4000-8000-000000000003','Forged cross-tenant process');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Cross-tenant improvement process link succeeded'; end if;

  -- Required approval roles are enforced by the database, not just the internal form.
  insert into public.decisions (id,organization_id,kind,risk_level,required_approval_role,title,context,why_needed,
    requested_from_membership_id,requested_by_membership_id,client_visible)
    values ('a3180000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000001',
      'approval','elevated','client_admin','Administrator-only approval','Synthetic elevated request',
      'Verify required role enforcement','a3120000-0000-4000-8000-000000000005',
      'a3120000-0000-4000-8000-000000000001',true);
  insert into public.decision_options (id,organization_id,decision_id,title,client_visible)
    values ('a3190000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000001',
      'a3180000-0000-4000-8000-000000000002','Approve elevated request',true);
  insert into public.approvals (id,organization_id,decision_id,requested_from_membership_id)
    values ('a3200000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000001',
      'a3180000-0000-4000-8000-000000000002','a3120000-0000-4000-8000-000000000005');
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000005',true);
  blocked := false;
  begin
    update public.approvals set status='approved',confirmation_text='APPROVE',
      selected_option_id='a3190000-0000-4000-8000-000000000002'
      where id='a3200000-0000-4000-8000-000000000002';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Client user satisfied a client-admin approval'; end if;

  -- Suspending a membership immediately removes tenant reads.
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000001',true);
  update public.organization_memberships set status='suspended'
    where id='a3120000-0000-4000-8000-000000000005';
  perform set_config('request.jwt.claim.sub','a3100000-0000-4000-8000-000000000005',true);
  if exists (select 1 from public.organizations where id='a3110000-0000-4000-8000-000000000001')
    or exists (select 1 from public.processes where id='a3140000-0000-4000-8000-000000000001') then
    raise exception 'Suspended member retained tenant access'; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.organizations
    where id='a3110000-0000-4000-8000-000000000005') then
    raise exception 'Failed provisioning left a partial organization';
  end if;
end $$;
rollback;
select 'pilot RLS, Stage 1 tenancy, atomic provisioning, relationship, suspension, and approval assertions passed (all fixtures rolled back)' as result;
