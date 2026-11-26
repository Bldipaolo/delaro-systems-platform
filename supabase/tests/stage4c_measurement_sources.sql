-- Run with an administrative connection. Every fixture is rolled back.
begin;

insert into auth.users(id,email) values
  ('e4000000-0000-4000-8000-000000000001','stage4c-internal@example.invalid'),
  ('e4000000-0000-4000-8000-000000000002','stage4c-client@example.invalid'),
  ('e4000000-0000-4000-8000-000000000003','stage4c-foreign@example.invalid');
insert into public.organizations(id,name) values
  ('e4010000-0000-4000-8000-000000000001','Stage 4C tenant'),
  ('e4010000-0000-4000-8000-000000000002','Stage 4C foreign tenant');
insert into public.organization_memberships(id,organization_id,user_id,role,status) values
  ('e4020000-0000-4000-8000-000000000001','e4010000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','delaro_admin','active'),
  ('e4020000-0000-4000-8000-000000000002','e4010000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','client_admin','active'),
  ('e4020000-0000-4000-8000-000000000003','e4010000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000003','client_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.measurement_sources(
  id,organization_id,name,provider_type,connection_mode,external_reference,
  public_configuration,status,client_visible
) values (
  'e4030000-0000-4000-8000-000000000001','e4010000-0000-4000-8000-000000000001',
  'Stage 4C HubSpot fixture','hubspot','pull','stage4c-portal',
  '{"account_label":"Fixture portal"}'::jsonb,'configured',true
);
do $$ begin
  if not exists (
    select 1 from public.measurement_sources
    where id='e4030000-0000-4000-8000-000000000001'
      and created_by_membership_id='e4020000-0000-4000-8000-000000000001'
      and updated_by_membership_id='e4020000-0000-4000-8000-000000000001'
  ) then raise exception 'Source attribution was not stamped'; end if;
  begin
    insert into public.measurement_sources(
      organization_id,name,provider_type,connection_mode,public_configuration
    ) values (
      'e4010000-0000-4000-8000-000000000001','Unsafe source','api','pull','{"api_key":"must-not-store"}'::jsonb
    );
    raise exception 'Public source configuration accepted a secret';
  exception when data_exception then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.measurement_sources where id='e4030000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Published source is not visible to the tenant client';
  end if;
  begin
    update public.measurement_sources set name='Client mutation' where id='e4030000-0000-4000-8000-000000000001';
    if found then raise exception 'Client updated a measurement source'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.read_measurement_source_secret('e4030000-0000-4000-8000-000000000001');
    raise exception 'Client executed the secret-reader RPC';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.measurement_sources) then
    raise exception 'Cross-tenant source read succeeded';
  end if;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.store_measurement_source_secret(
  'e4030000-0000-4000-8000-000000000001','e4010000-0000-4000-8000-000000000001',
  'oauth_token','encrypted-fixture-payload','fixture-initialization-vector','fixture-authentication-tag',1::smallint
);
do $$ begin
  if (select count(*) from public.read_measurement_source_secret('e4030000-0000-4000-8000-000000000001')) <> 1 then
    raise exception 'Server-only encrypted secret round trip failed';
  end if;
end $$;
reset role;

rollback;
select 'Stage 4C source tenancy, attribution, secret rejection, and server-only credential assertions passed (fixtures rolled back)' as result;
