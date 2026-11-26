-- Stage 4C checkpoint 2: declarative source-to-metric mappings and one
-- normalized observation pipeline. No raw provider payloads are persisted.

alter table public.measurement_sources
  add column workflow_id uuid,
  add foreign key (organization_id,workflow_id)
    references public.implementation_workflows(organization_id,id) on delete set null (workflow_id);
create unique index measurement_sources_workflow_idx
  on public.measurement_sources (organization_id,workflow_id)
  where workflow_id is not null;

-- Permit trusted migration/service operations while keeping browser-originated
-- attribution immutable and rejecting secrets in the public configuration.
create or replace function private.stage4c_guard_measurement_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  if new.public_configuration::text ~* '"[^\"]*(secret|token|password|authorization|api[_ -]?key)[^\"]*"[[:space:]]*:' then
    raise data_exception using message = 'Secrets are not allowed in public measurement source configuration';
  end if;
  if (select auth.role()) = 'service_role'
     or ((select auth.uid()) is null and (select auth.role()) is distinct from 'authenticated') then
    return new;
  end if;
  select membership.id into actor
  from public.organization_memberships membership
  where membership.organization_id = new.organization_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('delaro_admin','delaro_consultant')
  limit 1;
  if actor is null then
    raise insufficient_privilege using message = 'Internal measurement-source access required';
  end if;
  if tg_op = 'INSERT' then
    new.created_by_membership_id := actor;
  else
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise check_violation using message = 'Measurement source identity is immutable';
    end if;
    new.created_by_membership_id := old.created_by_membership_id;
  end if;
  new.updated_by_membership_id := actor;
  if new.status = 'disabled' and new.disabled_at is null then
    new.disabled_at := clock_timestamp();
  elsif new.status <> 'disabled' then
    new.disabled_at := null;
  end if;
  return new;
end $$;

create table public.measurement_source_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null,
  metric_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 160),
  provider_object text not null check (length(trim(provider_object)) between 1 and 160),
  value_field text not null check (value_field ~ '^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)*$' and length(value_field) <= 240),
  timestamp_field text check (timestamp_field is null or (timestamp_field ~ '^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)*$' and length(timestamp_field) <= 240)),
  external_id_field text check (external_id_field is null or (external_id_field ~ '^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)*$' and length(external_id_field) <= 240)),
  filter_definition jsonb not null default '{}'::jsonb check (jsonb_typeof(filter_definition) = 'object'),
  transform_kind text not null default 'identity' check (transform_kind in (
    'identity','scale','duration_ms_to_seconds','minor_currency_to_major','fraction_to_percentage'
  )),
  scale_factor numeric(18,8) not null default 1,
  offset_value numeric(18,8) not null default 0,
  aggregation_method text not null default 'latest' check (aggregation_method in ('latest','count','sum','average','minimum','maximum')),
  period_granularity text not null default 'event' check (period_granularity in ('event','day','week','month','quarter')),
  source_timezone text not null default 'UTC' check (length(source_timezone) between 1 and 80),
  status text not null default 'active' check (status in ('active','disabled')),
  client_visible boolean not null default false,
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,source_id)
    references public.measurement_sources(organization_id,id) on delete cascade,
  foreign key (organization_id,metric_id)
    references public.measurement_metrics(organization_id,id) on delete cascade,
  foreign key (organization_id,created_by_membership_id)
    references public.organization_memberships(organization_id,id) on delete set null (created_by_membership_id),
  foreign key (organization_id,updated_by_membership_id)
    references public.organization_memberships(organization_id,id) on delete set null (updated_by_membership_id),
  check (transform_kind = 'scale' or (scale_factor = 1 and offset_value = 0))
);

create unique index measurement_source_mappings_active_metric_idx
  on public.measurement_source_mappings (organization_id,source_id,metric_id)
  where status = 'active';
create index measurement_source_mappings_source_idx
  on public.measurement_source_mappings (organization_id,source_id);
create index measurement_source_mappings_metric_idx
  on public.measurement_source_mappings (organization_id,metric_id,status);
create index measurement_source_mappings_created_by_idx
  on public.measurement_source_mappings (organization_id,created_by_membership_id)
  where created_by_membership_id is not null;
create index measurement_source_mappings_updated_by_idx
  on public.measurement_source_mappings (organization_id,updated_by_membership_id)
  where updated_by_membership_id is not null;

create function private.stage4c_guard_measurement_mapping()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  if new.filter_definition::text ~* '"[^\"]*(secret|token|password|authorization|api[_ -]?key)[^\"]*"[[:space:]]*:' then
    raise data_exception using message = 'Secrets are not allowed in metric mapping filters';
  end if;
  if (select auth.role()) = 'service_role'
     or ((select auth.uid()) is null and (select auth.role()) is distinct from 'authenticated') then
    return new;
  end if;
  select membership.id into actor
  from public.organization_memberships membership
  where membership.organization_id = new.organization_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('delaro_admin','delaro_consultant')
  limit 1;
  if actor is null then raise insufficient_privilege using message = 'Internal metric-mapping access required'; end if;
  if tg_op = 'INSERT' then
    new.created_by_membership_id := actor;
  else
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise check_violation using message = 'Metric mapping identity is immutable';
    end if;
    new.created_by_membership_id := old.created_by_membership_id;
  end if;
  new.updated_by_membership_id := actor;
  return new;
end $$;

create trigger measurement_source_mappings_guard
  before insert or update on public.measurement_source_mappings
  for each row execute function private.stage4c_guard_measurement_mapping();
create trigger measurement_source_mappings_updated_at
  before update on public.measurement_source_mappings
  for each row execute function public.set_updated_at();

alter table public.measurement_source_mappings enable row level security;
revoke all on public.measurement_source_mappings from anon,authenticated;
grant select,insert,update,delete on public.measurement_source_mappings to authenticated;
create policy "Internal users manage measurement mappings" on public.measurement_source_mappings
  for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members view published measurement mappings" on public.measurement_source_mappings
  for select to authenticated using (
    client_visible and status = 'active' and private.is_org_member(organization_id)
    and exists (
      select 1 from public.measurement_sources source
      where source.organization_id=measurement_source_mappings.organization_id
        and source.id=measurement_source_mappings.source_id and source.client_visible
        and source.status in ('configured','healthy','stale','degraded')
    )
    and exists (
      select 1 from public.measurement_metrics metric
      where metric.organization_id=measurement_source_mappings.organization_id
        and metric.id=measurement_source_mappings.metric_id and metric.client_visible
    )
  );

drop policy if exists "Members view published observed measurements" on public.metric_observations;
create policy "Members view published observed measurements" on public.metric_observations
  for select to authenticated using (
    client_visible and measurement_status = 'observed' and verification_status = 'submitted'
    and ingestion_method in ('n8n','api','database','hubspot','webhook','csv')
    and private.is_org_member(organization_id)
    and exists (
      select 1 from public.measurement_metrics metric
      where metric.organization_id=metric_observations.organization_id
        and metric.id=metric_observations.metric_id and metric.client_visible
        and metric.auto_publish_observations
    )
  );

alter table public.metric_observations
  drop constraint if exists metric_observations_ingestion_method_check,
  add column measurement_source_id uuid,
  add column source_mapping_id uuid,
  add column source_record_id text check (source_record_id is null or length(source_record_id) between 1 and 140),
  add column source_record_updated_at timestamptz,
  add constraint metric_observations_ingestion_method_check
    check (ingestion_method in ('manual','n8n','api','csv','database','hubspot','webhook')),
  add foreign key (organization_id,measurement_source_id)
    references public.measurement_sources(organization_id,id) on delete set null (measurement_source_id),
  add foreign key (organization_id,source_mapping_id)
    references public.measurement_source_mappings(organization_id,id) on delete set null (source_mapping_id),
  add constraint metric_observations_source_provenance_check check (
    (source_mapping_id is null and measurement_source_id is null)
    or (source_mapping_id is not null and measurement_source_id is not null and source_record_id is not null)
  );

create unique index metric_observations_source_record_idx
  on public.metric_observations (organization_id,source_mapping_id,source_record_id)
  where source_mapping_id is not null and source_record_id is not null;
create index metric_observations_source_idx
  on public.metric_observations (organization_id,measurement_source_id,measured_at desc)
  where measurement_source_id is not null;

create table public.measurement_source_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null,
  mapping_id uuid not null,
  metric_id uuid not null,
  observation_id uuid,
  source_record_id text not null check (length(source_record_id) between 1 and 140),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  transform_version smallint not null default 1 check (transform_version > 0),
  received_at timestamptz not null default now(),
  unique (organization_id,mapping_id,source_record_id),
  foreign key (organization_id,source_id)
    references public.measurement_sources(organization_id,id) on delete cascade,
  foreign key (organization_id,mapping_id)
    references public.measurement_source_mappings(organization_id,id) on delete cascade,
  foreign key (organization_id,metric_id)
    references public.measurement_metrics(organization_id,id) on delete cascade,
  foreign key (observation_id) references public.metric_observations(id) on delete set null
);
create index measurement_source_ingestion_events_timeline_idx
  on public.measurement_source_ingestion_events (organization_id,source_id,received_at desc);
create index measurement_source_ingestion_events_observation_idx
  on public.measurement_source_ingestion_events (observation_id) where observation_id is not null;

alter table public.measurement_source_ingestion_events enable row level security;
revoke all on public.measurement_source_ingestion_events from anon,authenticated;
grant select on public.measurement_source_ingestion_events to authenticated;
create policy "Internal users view source ingestion events" on public.measurement_source_ingestion_events
  for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

-- Represent existing n8n measurement reporters as first-class sources and
-- mappings. No credentials are moved or regenerated.
insert into public.measurement_sources(
  organization_id,workflow_id,name,provider_type,connection_mode,external_reference,
  public_configuration,status,client_visible
)
select workflow.organization_id,workflow.id,workflow.workflow_name,'n8n','push',workflow.id::text,
       jsonb_build_object('workflow_id',workflow.id,'platform',workflow.platform),
       case when workflow.monitoring_status='connected' then 'healthy'
            when workflow.monitoring_status='degraded' then 'degraded'
            else 'configured' end,
       workflow.client_visible
from public.implementation_workflows workflow
where exists (
  select 1 from public.workflow_metrics link
  where link.organization_id=workflow.organization_id and link.workflow_id=workflow.id
)
on conflict (organization_id,workflow_id) where workflow_id is not null do nothing;

insert into public.measurement_source_mappings(
  organization_id,source_id,metric_id,name,provider_object,value_field,timestamp_field,
  external_id_field,aggregation_method,period_granularity,status,client_visible
)
select link.organization_id,source.id,link.metric_id,
       coalesce(nullif(trim(link.relationship),''),'Workflow metric'),
       'workflow_execution','value','measuredAt','eventId','latest','event','active',
       source.client_visible and metric.client_visible
from public.workflow_metrics link
join public.measurement_sources source
  on source.organization_id=link.organization_id and source.workflow_id=link.workflow_id
join public.measurement_metrics metric
  on metric.organization_id=link.organization_id and metric.id=link.metric_id
on conflict (organization_id,source_id,metric_id) where status='active' do nothing;

create function private.stage4c_attach_source_provenance()
returns trigger language plpgsql set search_path = '' as $$
declare source_record record;
begin
  if new.measurement_source_id is not null or new.ingestion_method <> 'n8n' or new.external_event_id is null then
    return new;
  end if;
  select source.id as source_id,mapping.id as mapping_id
  into source_record
  from public.metric_ingestion_events event
  join public.measurement_sources source
    on source.organization_id=event.organization_id and source.workflow_id=event.workflow_id
  join public.measurement_source_mappings mapping
    on mapping.organization_id=source.organization_id and mapping.source_id=source.id
   and mapping.metric_id=event.metric_id and mapping.status='active'
  where event.organization_id=new.organization_id and event.metric_id=new.metric_id
    and event.external_event_id=new.external_event_id
  limit 1;
  if found then
    new.measurement_source_id := source_record.source_id;
    new.source_mapping_id := source_record.mapping_id;
    new.source_record_id := new.external_event_id;
  end if;
  return new;
end $$;
create trigger stage4c_attach_source_provenance
  before insert on public.metric_observations
  for each row execute function private.stage4c_attach_source_provenance();

update public.metric_observations observation
set measurement_source_id=source.id,
    source_mapping_id=mapping.id,
    source_record_id=observation.external_event_id
from public.metric_ingestion_events event
join public.measurement_sources source
  on source.organization_id=event.organization_id and source.workflow_id=event.workflow_id
join public.measurement_source_mappings mapping
  on mapping.organization_id=source.organization_id and mapping.source_id=source.id
 and mapping.metric_id=event.metric_id and mapping.status='active'
where observation.organization_id=event.organization_id
  and observation.metric_id=event.metric_id
  and observation.external_event_id=event.external_event_id
  and observation.measurement_source_id is null;

create function private.stage4c_sync_workflow_metric_source()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare source_id uuid;
declare workflow public.implementation_workflows%rowtype;
declare metric public.measurement_metrics%rowtype;
begin
  if tg_op = 'DELETE' then
    update public.measurement_source_mappings mapping set status='disabled'
    from public.measurement_sources source
    where source.organization_id=old.organization_id and source.workflow_id=old.workflow_id
      and mapping.organization_id=source.organization_id and mapping.source_id=source.id
      and mapping.metric_id=old.metric_id and mapping.status='active';
    return old;
  end if;
  select * into workflow from public.implementation_workflows stored
    where stored.organization_id=new.organization_id and stored.id=new.workflow_id;
  select * into metric from public.measurement_metrics stored
    where stored.organization_id=new.organization_id and stored.id=new.metric_id;
  insert into public.measurement_sources(
    organization_id,workflow_id,name,provider_type,connection_mode,external_reference,
    public_configuration,status,client_visible
  ) values (
    workflow.organization_id,workflow.id,workflow.workflow_name,'n8n','push',workflow.id::text,
    jsonb_build_object('workflow_id',workflow.id,'platform',workflow.platform),
    case when workflow.monitoring_status='connected' then 'healthy'
         when workflow.monitoring_status='degraded' then 'degraded' else 'configured' end,
    workflow.client_visible
  )
  on conflict (organization_id,workflow_id) where workflow_id is not null do update set
    name=excluded.name,public_configuration=excluded.public_configuration,
    status=excluded.status,client_visible=excluded.client_visible
  returning id into source_id;
  insert into public.measurement_source_mappings(
    organization_id,source_id,metric_id,name,provider_object,value_field,timestamp_field,
    external_id_field,aggregation_method,period_granularity,status,client_visible
  ) values (
    new.organization_id,source_id,new.metric_id,coalesce(nullif(trim(new.relationship),''),'Workflow metric'),
    'workflow_execution','value','measuredAt','eventId','latest','event','active',
    workflow.client_visible and metric.client_visible
  )
  on conflict (organization_id,source_id,metric_id) where status='active' do update set
    name=excluded.name,client_visible=excluded.client_visible;
  return new;
end $$;

create trigger stage4c_sync_workflow_metric_source
  after insert or update on public.workflow_metrics
  for each row execute function private.stage4c_sync_workflow_metric_source();
create trigger stage4c_disable_workflow_metric_source
  after delete on public.workflow_metrics
  for each row execute function private.stage4c_sync_workflow_metric_source();

create function public.ingest_mapped_metric_observation(
  target_source_id uuid,
  target_mapping_id uuid,
  external_record_key text,
  reported_value numeric,
  reported_measured_at timestamptz,
  reported_period_start date,
  reported_period_end date,
  reported_sample_size integer,
  reported_source_reference text,
  reported_source_updated_at timestamptz,
  reported_payload_digest text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source public.measurement_sources%rowtype;
  mapping public.measurement_source_mappings%rowtype;
  metric public.measurement_metrics%rowtype;
  event_id uuid;
  created_observation_id uuid;
  normalized_value numeric;
  normalized_ingestion_method text;
  normalized_external_event text;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message='Service role required';
  end if;
  select * into source from public.measurement_sources stored
    where stored.id=target_source_id and stored.status in ('configured','healthy','stale','degraded');
  if not found then raise insufficient_privilege using message='Measurement source is unavailable'; end if;
  select * into mapping from public.measurement_source_mappings stored
    where stored.id=target_mapping_id and stored.organization_id=source.organization_id
      and stored.source_id=source.id and stored.status='active';
  if not found then raise insufficient_privilege using message='Metric mapping is unavailable'; end if;
  select * into metric from public.measurement_metrics stored
    where stored.organization_id=source.organization_id and stored.id=mapping.metric_id and stored.status='active';
  if not found then raise insufficient_privilege using message='Metric is unavailable'; end if;
  if length(external_record_key) not between 1 and 140 or reported_value is null
     or reported_measured_at > clock_timestamp()+interval '5 minutes'
     or reported_measured_at < clock_timestamp()-interval '5 years'
     or (reported_period_end is not null and reported_period_start is not null and reported_period_end < reported_period_start)
     or (reported_sample_size is not null and reported_sample_size <= 0)
     or length(coalesce(reported_source_reference,'')) > 500
     or reported_payload_digest !~ '^[0-9a-f]{64}$' then
    raise data_exception using message='Invalid mapped metric observation';
  end if;
  normalized_value := case mapping.transform_kind
    when 'scale' then reported_value*mapping.scale_factor+mapping.offset_value
    when 'duration_ms_to_seconds' then reported_value/1000
    when 'minor_currency_to_major' then reported_value/100
    when 'fraction_to_percentage' then reported_value*100
    else reported_value end;
  normalized_ingestion_method := case source.provider_type
    when 'n8n' then 'n8n' when 'hubspot' then 'hubspot' when 'database' then 'database'
    when 'csv' then 'csv' when 'webhook' then 'webhook' else 'api' end;
  normalized_external_event := mapping.id::text || ':' || external_record_key;
  insert into public.measurement_source_ingestion_events(
    organization_id,source_id,mapping_id,metric_id,source_record_id,payload_digest
  ) values (
    source.organization_id,source.id,mapping.id,metric.id,external_record_key,reported_payload_digest
  ) on conflict(organization_id,mapping_id,source_record_id) do nothing returning id into event_id;
  if event_id is null then
    select stored.observation_id into created_observation_id
    from public.measurement_source_ingestion_events stored
    where stored.organization_id=source.organization_id and stored.mapping_id=mapping.id
      and stored.source_record_id=external_record_key;
    return jsonb_build_object('accepted',true,'duplicate',true,'observation_id',created_observation_id);
  end if;
  insert into public.metric_observations(
    organization_id,metric_id,measured_value,measured_at,period_start,period_end,
    source_description,source_reference,sample_size,aggregation_method,ingestion_method,
    measurement_status,external_event_id,client_visible,verification_status,
    measurement_source_id,source_mapping_id,source_record_id,source_record_updated_at
  ) values (
    source.organization_id,metric.id,normalized_value,reported_measured_at,
    reported_period_start,reported_period_end,source.name,nullif(trim(reported_source_reference),''),
    reported_sample_size,mapping.aggregation_method,normalized_ingestion_method,'observed',
    normalized_external_event,
    metric.auto_publish_observations and source.client_visible and mapping.client_visible,
    'submitted',source.id,mapping.id,external_record_key,reported_source_updated_at
  ) returning id into created_observation_id;
  update public.measurement_source_ingestion_events stored
    set observation_id=created_observation_id where stored.id=event_id;
  return jsonb_build_object('accepted',true,'duplicate',false,'observation_id',created_observation_id);
end $$;

revoke all on function public.ingest_mapped_metric_observation(uuid,uuid,text,numeric,timestamptz,date,date,integer,text,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.ingest_mapped_metric_observation(uuid,uuid,text,numeric,timestamptz,date,date,integer,text,timestamptz,text)
  to service_role;

comment on table public.measurement_source_mappings is
  'Declarative, bounded transformations from provider fields into Delaro metrics.';
comment on table public.measurement_source_ingestion_events is
  'Payload-free idempotency and provenance ledger for normalized observations.';
