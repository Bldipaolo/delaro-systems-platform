-- Run with an administrative connection. Every fixture is rolled back.
begin;

insert into auth.users(id,email) values
  ('d4000000-0000-4000-8000-000000000001','stage4b-internal@example.invalid'),
  ('d4000000-0000-4000-8000-000000000002','stage4b-client@example.invalid'),
  ('d4000000-0000-4000-8000-000000000003','stage4b-foreign@example.invalid');
insert into public.organizations(id,name) values
  ('d4010000-0000-4000-8000-000000000001','Stage 4B tenant'),
  ('d4010000-0000-4000-8000-000000000002','Stage 4B foreign tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('d4020000-0000-4000-8000-000000000001','d4010000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('d4020000-0000-4000-8000-000000000002','d4010000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002','client_admin','active'),
  ('d4020000-0000-4000-8000-000000000003','d4010000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000003','client_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
insert into public.opportunities(id,organization_id,title,department_or_process,current_state_problem,business_consequence,
  financial_impact_score,frequency_score,addressability_score,measurement_quality_score,strategic_leverage_score,
  implementation_difficulty_score,organizational_complexity_score,risk_score,opportunity_score)
values('d4030000-0000-4000-8000-000000000001','d4010000-0000-4000-8000-000000000001','Synthetic Stage 4B opportunity','Test','Synthetic only','Synthetic only',3,3,3,3,3,3,3,3,24);
insert into public.measurement_metrics(id,organization_id,name,unit,improvement_direction,client_visible)
values('d4040000-0000-4000-8000-000000000001','d4010000-0000-4000-8000-000000000001','Synthetic handling time','minutes','decrease',true);
insert into public.implementation_workflows(
  id,organization_id,platform,instance_reference,external_workflow_id,workflow_name,
  environment,operational_status,monitoring_status,registration_source,client_visible
) values(
  'd4040000-0000-4000-8000-000000000002','d4010000-0000-4000-8000-000000000001',
  'n8n','Synthetic Stage 4B instance','stage4b-workflow','Synthetic Stage 4B workflow',
  'staging','active','configured','direct',true
);
insert into public.value_models(id,organization_id,workflow_id,name,category,formula_kind,calculation_method,annualization_basis,
  benefit_stream_key,economic_mechanism,time_horizon,recoverable_percentage,expected_capture_percentage)
values('d4050000-0000-4000-8000-000000000002','d4010000-0000-4000-8000-000000000001','d4040000-0000-4000-8000-000000000002',
  'Synthetic workflow-native model','capacity_creation','product','Synthetic workflow-native calculation','Synthetic test period',
  'stage4b_workflow_native','Workflow-native model acceptance test','monthly',100,100);
do $$ begin
  if not exists (
    select 1 from public.value_models
    where id='d4050000-0000-4000-8000-000000000002'
      and workflow_id='d4040000-0000-4000-8000-000000000002'
      and initiative_id is null and opportunity_id is null
  ) then raise exception 'Workflow-native value model was not created'; end if;
end $$;
insert into public.value_models(id,organization_id,opportunity_id,name,category,formula_kind,calculation_method,annualization_basis,
  benefit_stream_key,economic_mechanism,time_horizon,recoverable_percentage,expected_capture_percentage)
values('d4050000-0000-4000-8000-000000000001','d4010000-0000-4000-8000-000000000001','d4030000-0000-4000-8000-000000000001',
  'Synthetic acceptance model','capacity_creation','minutes_to_hours_product','Synthetic minutes × volume ÷ 60 × loaded hourly rate','Synthetic monthly period',
  'stage4b_synthetic_capacity','Released handling capacity','monthly',100,100);
insert into public.value_model_inputs(organization_id,model_id,input_key,label,role,value,unit,origin,source_description,client_visible)
values
  ('d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','minutes_saved','Minutes saved','factor',4,'minutes/email','known','Synthetic acceptance-test data',true),
  ('d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','volume','Monthly volume','factor',100,'emails/month','client_assumption','Synthetic acceptance-test data',true),
  ('d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','rate','Loaded labor rate','factor',30,'USD/hour','client_assumption','Synthetic acceptance-test data',true);
insert into public.value_model_inputs(organization_id,model_id,input_key,label,role,value,unit,origin,source_description,metric_id,derivation,stale_after_days,client_visible)
values('d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','verified_duration','Verified duration','factor',null,'minutes','known','Stage 4A metric','d4040000-0000-4000-8000-000000000001','metric_latest_verified',30,true);
insert into public.value_model_metric_links(organization_id,model_id,metric_id,relationship,client_visible)
values('d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','d4040000-0000-4000-8000-000000000001','driver',true);
insert into public.value_model_costs(organization_id,model_id,category,label,amount,currency_code,cadence,source_description,client_visible)
values('d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','software','Synthetic software cost',25,'USD','monthly','Synthetic acceptance-test data',true);
insert into public.value_model_validations(id,organization_id,model_id,requested_from_membership_id,requested_by_membership_id,request_note)
values('d4060000-0000-4000-8000-000000000001','d4010000-0000-4000-8000-000000000001','d4050000-0000-4000-8000-000000000001','d4020000-0000-4000-8000-000000000002','d4020000-0000-4000-8000-000000000001','Synthetic acceptance-test data');
update public.value_models set status='active',client_visible=true where id='d4050000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.value_models where id='d4050000-0000-4000-8000-000000000001') <> 1 then raise exception 'Published model hidden from tenant client'; end if;
  if (select count(*) from public.value_model_costs) <> 1 then raise exception 'Published model costs hidden from tenant client'; end if;
  if (select count(*) from public.value_model_validations where id='d4060000-0000-4000-8000-000000000001') <> 1 then raise exception 'Assigned validation hidden'; end if;
  update public.value_model_validations set status='approved',response_note='Synthetic approval' where id='d4060000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.value_model_validations where id='d4060000-0000-4000-8000-000000000001' and status='approved' and responded_by_membership_id='d4020000-0000-4000-8000-000000000002') then raise exception 'Client response was not safely stamped'; end if;
end $$;

select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.value_models) or exists(select 1 from public.value_model_inputs)
    or exists(select 1 from public.value_model_costs) or exists(select 1 from public.value_model_validations) then
    raise exception 'Cross-tenant economic data read succeeded';
  end if;
end $$;
reset role;

rollback;
select 'Stage 4B workflow-native model, publication, client validation, cost visibility, and tenant isolation assertions passed (fixtures rolled back)' as result;
