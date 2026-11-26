-- Run with an administrative connection. Every fixture is rolled back.
begin;

insert into auth.users(id,email) values
  ('e5000000-0000-4000-8000-000000000001','stage5a-internal@example.invalid'),
  ('e5000000-0000-4000-8000-000000000002','stage5a-client@example.invalid'),
  ('e5000000-0000-4000-8000-000000000003','stage5a-foreign@example.invalid'),
  ('e5000000-0000-4000-8000-000000000004','stage5a-suspended@example.invalid');
insert into public.organizations(id,name) values
  ('e5010000-0000-4000-8000-000000000001','Stage 5A tenant'),
  ('e5010000-0000-4000-8000-000000000002','Stage 5A foreign tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('e5020000-0000-4000-8000-000000000001','e5010000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('e5020000-0000-4000-8000-000000000002','e5010000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','client_admin','active'),
  ('e5020000-0000-4000-8000-000000000003','e5010000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000003','client_admin','active'),
  ('e5020000-0000-4000-8000-000000000004','e5010000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000004','client_admin','suspended');

set local role authenticated;
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.measurement_sources(
  id,organization_id,name,provider_type,connection_mode,status,client_visible
) values
  ('e5030000-0000-4000-8000-000000000001','e5010000-0000-4000-8000-000000000001','Reviewed source','api','push','degraded',true),
  ('e5030000-0000-4000-8000-000000000002','e5010000-0000-4000-8000-000000000001','Published source','api','push','degraded',true);
insert into public.operational_signal_rules(
  id,organization_id,name,signal_type,entity_type,measurement_source_id,detection_method,
  current_window_minutes,reference_window_minutes,minimum_current_samples,minimum_reference_samples,
  minimum_consecutive_periods,importance,client_publication_mode
) values
  ('e5040000-0000-4000-8000-000000000001','e5010000-0000-4000-8000-000000000001','Reviewed source health',
    'source_degraded','measurement_source','e5030000-0000-4000-8000-000000000001','source_health',60,1440,1,1,1,4,'review_required'),
  ('e5040000-0000-4000-8000-000000000002','e5010000-0000-4000-8000-000000000001','Published source health',
    'source_degraded','measurement_source','e5030000-0000-4000-8000-000000000002','source_health',60,1440,1,1,1,4,'auto_publish');
do $$ begin
  if exists(
    select 1 from public.operational_signal_rules
    where created_by_membership_id is distinct from 'e5020000-0000-4000-8000-000000000001'
       or updated_by_membership_id is distinct from 'e5020000-0000-4000-8000-000000000001'
  ) then raise exception 'Rule attribution was not stamped'; end if;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.operational_signals(
  id,organization_id,rule_id,identity_key,signal_type,entity_type,measurement_source_id,
  title,business_summary,detection_method,severity,confidence,current_sample_size,
  reference_sample_size,consecutive_periods,first_detected_at,last_observed_at,
  evidence_summary,visibility_status
) values (
  'e5050000-0000-4000-8000-000000000001','e5010000-0000-4000-8000-000000000001',
  'e5040000-0000-4000-8000-000000000001',repeat('a',64),'source_degraded','measurement_source',
  'e5030000-0000-4000-8000-000000000001','Reviewed source needs attention',
  'The source is degraded; business performance is not inferred.','source_health','medium','high',1,1,3,
  clock_timestamp()-interval '1 hour',clock_timestamp(),'{"sourceHealth":"degraded"}'::jsonb,'internal_only'
);
insert into public.operational_signal_internal_details(organization_id,signal_id,internal_notes)
values('e5010000-0000-4000-8000-000000000001','e5050000-0000-4000-8000-000000000001','Private diagnostic note');
do $$ begin
  begin
    insert into public.operational_signals(
      organization_id,rule_id,identity_key,signal_type,entity_type,measurement_source_id,title,business_summary,
      detection_method,severity,confidence,first_detected_at,last_observed_at
    ) values (
      'e5010000-0000-4000-8000-000000000001','e5040000-0000-4000-8000-000000000001',repeat('a',64),
      'source_degraded','measurement_source','e5030000-0000-4000-8000-000000000001','Duplicate signal',
      'This duplicate must not persist.','source_health','medium','high',clock_timestamp(),clock_timestamp()
    );
    raise exception 'Duplicate signal identity was accepted';
  exception when unique_violation then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.operational_signals) then raise exception 'Internal-only signal leaked to client'; end if;
  if exists(select 1 from public.operational_signal_internal_details) then raise exception 'Internal signal details leaked to client'; end if;
  begin
    update public.operational_signals set status='acknowledged' where id='e5050000-0000-4000-8000-000000000001';
    if found then raise exception 'Client updated a signal'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    update public.operational_signals set current_value=999 where id='e5050000-0000-4000-8000-000000000001';
    raise exception 'Internal user changed evaluator-managed evidence';
  exception when check_violation then null;
  end;
end $$;
update public.operational_signals set visibility_status='client_visible'
where id='e5050000-0000-4000-8000-000000000001';
do $$ begin
  if not exists(
    select 1 from public.operational_signals
    where id='e5050000-0000-4000-8000-000000000001'
      and publication_reason='analyst_review'
      and reviewed_by_membership_id='e5020000-0000-4000-8000-000000000001'
      and reviewed_at is not null
  ) then raise exception 'Human publication review was not attributed'; end if;
end $$;

select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.operational_signals) <> 1 then raise exception 'Published signal is not client-visible'; end if;
  if exists(select 1 from public.operational_signal_internal_details) then raise exception 'Internal details became client-visible'; end if;
  if (select count(*) from public.system_events where operational_signal_id='e5050000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Reviewed publication did not create one activity event';
  end if;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.operational_signals(
  id,organization_id,rule_id,identity_key,signal_type,entity_type,measurement_source_id,
  title,business_summary,detection_method,severity,confidence,current_sample_size,
  reference_sample_size,consecutive_periods,first_detected_at,last_observed_at,
  evidence_summary,visibility_status,publication_reason
) values (
  'e5050000-0000-4000-8000-000000000002','e5010000-0000-4000-8000-000000000001',
  'e5040000-0000-4000-8000-000000000002',repeat('b',64),'source_degraded','measurement_source',
  'e5030000-0000-4000-8000-000000000002','Published source needs attention',
  'The source is degraded; business performance is not inferred.','source_health','high','high',1,1,4,
  clock_timestamp()-interval '2 hours',clock_timestamp(),'{"sourceHealth":"degraded"}'::jsonb,
  'client_visible','automatic_infrastructure'
);
update public.operational_signals set last_observed_at=clock_timestamp()
where id='e5050000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.operational_signal_events where signal_id='e5050000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'Evidence refresh created duplicate lifecycle activity';
  end if;
end $$;
update public.operational_signals set status='resolved',resolved_at=clock_timestamp()
where id='e5050000-0000-4000-8000-000000000002';
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.operational_signals) <> 2 then raise exception 'Automatic infrastructure publication is not client-visible'; end if;
  if (select count(*) from public.system_events where operational_signal_id='e5050000-0000-4000-8000-000000000002') <> 2 then
    raise exception 'Detected and recovered activity transitions were not projected exactly once';
  end if;
end $$;

select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.operational_signals) then raise exception 'Cross-tenant signal read succeeded'; end if;
  if exists(select 1 from public.operational_signal_events) then raise exception 'Cross-tenant signal event read succeeded'; end if;
end $$;

select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000004',true);
do $$ begin
  if exists(select 1 from public.operational_signals) then raise exception 'Suspended member read a signal'; end if;
end $$;
reset role;

rollback;
select 'Stage 5A signal isolation, publication, immutability, deduplication, and lifecycle assertions passed (fixtures rolled back)' as result;
