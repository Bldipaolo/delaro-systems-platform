-- Stage 4A: extend the existing evidence-led measurement architecture with
-- workflow-scoped automated observations. Automated data is observed, never
-- silently verified; verification continues through the existing human review.

alter table public.measurement_metrics
  drop constraint if exists measurement_metrics_check,
  add column metric_type text not null default 'other'
    check (metric_type in ('duration','percentage','count','currency','rate','ratio','other')),
  add column status text not null default 'active'
    check (status in ('active','inactive')),
  add column auto_publish_observations boolean not null default false;

alter table public.metric_baselines
  add column sample_size integer check (sample_size is null or sample_size > 0),
  add column aggregation_method text;

alter table public.metric_observations
  add column sample_size integer check (sample_size is null or sample_size > 0),
  add column aggregation_method text,
  add column source_reference text,
  add column ingestion_method text not null default 'manual'
    check (ingestion_method in ('manual','n8n','api','csv','database')),
  add column measurement_status text not null default 'unverified'
    check (measurement_status in ('unverified','estimated','observed','verified')),
  add column external_event_id text,
  add column client_visible boolean not null default false;

update public.metric_observations
set measurement_status = case when verification_status = 'verified' then 'verified' else 'unverified' end,
    client_visible = verification_status = 'verified';

create unique index metric_observations_external_event_idx
  on public.metric_observations (organization_id,metric_id,external_event_id)
  where external_event_id is not null;
create index metric_observations_publication_idx
  on public.metric_observations (organization_id,metric_id,client_visible,measurement_status,measured_at desc);

create table public.metric_ingestion_credentials (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null,
  workflow_id uuid,
  label text not null check (length(trim(label)) between 2 and 160),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null check (length(token_hint) = 8),
  status text not null default 'active' check (status in ('active','revoked')),
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 600),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_membership_id uuid,
  revoked_by_membership_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,metric_id) references public.measurement_metrics(organization_id,id) on delete cascade,
  foreign key (organization_id,workflow_id) references public.implementation_workflows(organization_id,id) on delete cascade,
  foreign key (organization_id,created_by_membership_id) references public.organization_memberships(organization_id,id) on delete restrict,
  foreign key (organization_id,revoked_by_membership_id) references public.organization_memberships(organization_id,id) on delete restrict,
  check (status <> 'revoked' or (revoked_at is not null and revoked_by_membership_id is not null))
);
create unique index metric_ingestion_credentials_one_active_idx
  on public.metric_ingestion_credentials (organization_id,metric_id,coalesce(workflow_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

create table public.metric_ingestion_rate_windows (
  credential_id uuid not null,
  organization_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (credential_id,window_started_at),
  foreign key (organization_id,credential_id) references public.metric_ingestion_credentials(organization_id,id) on delete cascade
);

create table public.metric_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null,
  workflow_id uuid,
  credential_id uuid not null,
  observation_id uuid,
  external_event_id text not null check (length(external_event_id) between 1 and 180),
  source text not null check (source in ('n8n_metric_reporter','api_metric_reporter')),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  unique (organization_id,metric_id,external_event_id),
  foreign key (organization_id,metric_id) references public.measurement_metrics(organization_id,id) on delete cascade,
  foreign key (organization_id,workflow_id) references public.implementation_workflows(organization_id,id) on delete set null (workflow_id),
  foreign key (organization_id,credential_id) references public.metric_ingestion_credentials(organization_id,id) on delete restrict,
  foreign key (observation_id) references public.metric_observations(id) on delete set null
);
create index metric_ingestion_events_timeline_idx on public.metric_ingestion_events (organization_id,metric_id,received_at desc);

alter table public.metric_ingestion_credentials enable row level security;
alter table public.metric_ingestion_rate_windows enable row level security;
alter table public.metric_ingestion_events enable row level security;
revoke all on public.metric_ingestion_credentials,public.metric_ingestion_rate_windows,public.metric_ingestion_events from anon,authenticated;
grant select,insert,update on public.metric_ingestion_credentials to authenticated;
grant select on public.metric_ingestion_events to authenticated;

create policy "Internal users manage metric ingestion credentials" on public.metric_ingestion_credentials
  for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users view metric ingestion events" on public.metric_ingestion_events
  for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Members view published observed measurements" on public.metric_observations
  for select to authenticated using (
    client_visible and measurement_status = 'observed' and verification_status = 'submitted'
    and ingestion_method in ('n8n','api','database')
    and private.is_org_member(organization_id)
    and exists (select 1 from public.measurement_metrics metric
      where metric.organization_id = metric_observations.organization_id
        and metric.id = metric_observations.metric_id and metric.client_visible and metric.auto_publish_observations)
  );

create function public.rotate_metric_ingestion_credential(
  target_metric_id uuid,
  target_workflow_id uuid,
  new_credential_id uuid,
  new_secret_hash text,
  new_token_hint text,
  credential_label text default 'n8n metric reporter',
  credential_rate_limit integer default 60
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_org uuid; actor uuid;
begin
  select organization_id into target_org from public.measurement_metrics where id = target_metric_id;
  if target_org is null or not private.has_org_role(target_org,array['delaro_admin','delaro_consultant']::public.organization_member_role[]) then
    raise insufficient_privilege using message = 'Internal metric access required';
  end if;
  select id into actor from public.organization_memberships
    where organization_id=target_org and user_id=(select auth.uid()) and status='active'
      and role in ('delaro_admin','delaro_consultant');
  if target_workflow_id is not null and not exists (
    select 1 from public.workflow_metrics where organization_id=target_org and workflow_id=target_workflow_id and metric_id=target_metric_id
  ) then raise check_violation using message = 'Workflow must be linked to this metric'; end if;
  update public.metric_ingestion_credentials set status='revoked',revoked_at=clock_timestamp(),revoked_by_membership_id=actor
    where organization_id=target_org and metric_id=target_metric_id and workflow_id is not distinct from target_workflow_id and status='active';
  insert into public.metric_ingestion_credentials(id,organization_id,metric_id,workflow_id,label,secret_hash,token_hint,rate_limit_per_minute,created_by_membership_id)
  values(new_credential_id,target_org,target_metric_id,target_workflow_id,trim(credential_label),new_secret_hash,new_token_hint,credential_rate_limit,actor);
  return new_credential_id;
end $$;
revoke all on function public.rotate_metric_ingestion_credential(uuid,uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.rotate_metric_ingestion_credential(uuid,uuid,uuid,text,text,text,integer) to authenticated;

create function public.ingest_metric_observation(
  target_credential_id uuid,
  supplied_secret_hash text,
  external_event_key text,
  reported_value numeric,
  reported_unit text,
  reported_measured_at timestamptz,
  reported_period_start date,
  reported_period_end date,
  reported_sample_size integer,
  reported_aggregation_method text,
  reported_source_reference text,
  reported_source text,
  reported_payload_digest text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  credential public.metric_ingestion_credentials%rowtype;
  metric public.measurement_metrics%rowtype;
  inserted_event uuid;
  observation uuid;
  current_window timestamptz := date_trunc('minute',clock_timestamp());
  window_count integer;
begin
  select * into credential from public.metric_ingestion_credentials stored
    where stored.id=target_credential_id and stored.secret_hash=supplied_secret_hash and stored.status='active'
      and (stored.expires_at is null or stored.expires_at > clock_timestamp());
  if not found then raise insufficient_privilege using message='Invalid integration credential'; end if;
  select * into metric from public.measurement_metrics stored
    where stored.organization_id=credential.organization_id and stored.id=credential.metric_id and stored.status='active';
  if not found then raise insufficient_privilege using message='Metric is not active'; end if;
  if length(external_event_key) not between 1 and 180 or reported_value is null
    or reported_unit is distinct from metric.unit
    or reported_measured_at > clock_timestamp()+interval '5 minutes'
    or reported_measured_at < clock_timestamp()-interval '365 days'
    or (reported_period_end is not null and reported_period_start is not null and reported_period_end < reported_period_start)
    or (reported_sample_size is not null and reported_sample_size <= 0)
    or length(coalesce(reported_aggregation_method,'')) > 160
    or length(coalesce(reported_source_reference,'')) > 500
    or reported_source not in ('n8n_metric_reporter','api_metric_reporter')
    or reported_payload_digest !~ '^[0-9a-f]{64}$' then
    raise data_exception using message='Invalid metric observation';
  end if;
  update public.metric_ingestion_credentials set last_used_at=clock_timestamp() where id=credential.id;
  insert into public.metric_ingestion_rate_windows(credential_id,organization_id,window_started_at,request_count)
    values(credential.id,credential.organization_id,current_window,1)
    on conflict(credential_id,window_started_at) do update set request_count=public.metric_ingestion_rate_windows.request_count+1
      where public.metric_ingestion_rate_windows.request_count < credential.rate_limit_per_minute
    returning request_count into window_count;
  if window_count is null then raise program_limit_exceeded using message='Metric event rate limit exceeded'; end if;
  insert into public.metric_ingestion_events(organization_id,metric_id,workflow_id,credential_id,external_event_id,source,payload_digest)
    values(credential.organization_id,credential.metric_id,credential.workflow_id,credential.id,external_event_key,reported_source,reported_payload_digest)
    on conflict(organization_id,metric_id,external_event_id) do nothing returning id into inserted_event;
  if inserted_event is null then
    select id into observation from public.metric_observations where organization_id=credential.organization_id and metric_id=credential.metric_id and external_event_id=external_event_key;
    return jsonb_build_object('accepted',true,'duplicate',true,'observation_id',observation);
  end if;
  insert into public.metric_observations(organization_id,metric_id,measured_value,measured_at,period_start,period_end,
    source_description,source_reference,sample_size,aggregation_method,ingestion_method,measurement_status,external_event_id,
    client_visible,verification_status)
  values(credential.organization_id,credential.metric_id,reported_value,reported_measured_at,reported_period_start,reported_period_end,
    'Authenticated workflow observation',nullif(trim(reported_source_reference),''),reported_sample_size,nullif(trim(reported_aggregation_method),''),
    case when reported_source='n8n_metric_reporter' then 'n8n' else 'api' end,'observed',external_event_key,
    metric.auto_publish_observations,'submitted') returning id into observation;
  update public.metric_ingestion_events set observation_id=observation where id=inserted_event;
  return jsonb_build_object('accepted',true,'duplicate',false,'observation_id',observation);
end $$;
revoke all on function public.ingest_metric_observation(uuid,text,text,numeric,text,timestamptz,date,date,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ingest_metric_observation(uuid,text,text,numeric,text,timestamptz,date,date,integer,text,text,text,text) to service_role;

-- Allow the privileged ingestion RPC to create unattributed automated records,
-- while retaining authenticated internal attribution for manual entry.
create or replace function private.pilot_stamp_measurement_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.entered_by_membership_id is distinct from old.entered_by_membership_id then raise exception 'Measurement author is immutable'; end if;
    return new;
  end if;
  if tg_table_name = 'metric_observations' and new.ingestion_method <> 'manual' and auth.uid() is null then
    new.entered_by_membership_id := null;
  else
    new.entered_by_membership_id := private.pilot_internal_reviewer(new.organization_id);
  end if;
  return new;
end $$;

create or replace function private.stage4a_measurement_status_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.measurement_status='verified' and new.measurement_status is distinct from old.measurement_status then
    raise exception 'Verified measurement status is immutable';
  end if;
  if new.verification_status='verified' then new.measurement_status := 'verified'; new.client_visible := true;
  elsif new.measurement_status='verified' then raise exception 'Human verification is required';
  end if;
  if new.ingestion_method='manual' and new.measurement_status='observed' then raise exception 'Observed status requires authenticated automated ingestion'; end if;
  return new;
end $$;
create trigger stage4a_measurement_status_guard before insert or update on public.metric_observations
  for each row execute function private.stage4a_measurement_status_guard();

comment on table public.metric_ingestion_credentials is 'Hashed, revocable credentials scoped to one metric and optionally one workflow.';
comment on column public.metric_observations.measurement_status is 'Trust state: automated observations remain observed until human verification.';
