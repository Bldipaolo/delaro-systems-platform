-- Stage 3B: let Delaro register an existing workflow independently from the
-- formal implementation lifecycle while preserving the Stage 3A ingestion,
-- credential, event, and client-monitoring architecture.

alter table public.implementation_workflows
  alter column implementation_id drop not null,
  alter column purpose drop not null;

alter table public.implementation_workflows
  add column registration_source text not null default 'implementation'
    check (registration_source in ('implementation','direct')),
  add column workflow_url text,
  add column client_visible boolean not null default false;

alter table public.implementation_workflows
  add constraint implementation_workflows_source_link_check
    check (registration_source <> 'implementation' or implementation_id is not null),
  add constraint implementation_workflows_url_check
    check (
      workflow_url is null or (
        workflow_url ~ '^https://[^[:space:]]+$'
        and position('@' in split_part(workflow_url,'/',3)) = 0
        and length(workflow_url) <= 1000
      )
    );

-- Preserve the client visibility that implementation-linked workflows had
-- through the Stage 3A projection before client visibility became explicit.
update public.implementation_workflows workflow
set client_visible = true
from public.implementations implementation
join public.initiatives initiative
  on initiative.organization_id = implementation.organization_id
 and initiative.id = implementation.initiative_id
where workflow.organization_id = implementation.organization_id
  and workflow.implementation_id = implementation.id
  and implementation.client_visible
  and initiative.client_visible;

create table public.workflow_metrics (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  metric_id uuid not null,
  relationship text not null default 'Operational measure'
    check (length(trim(relationship)) between 2 and 180),
  created_at timestamptz not null default now(),
  primary key (organization_id,workflow_id,metric_id),
  foreign key (organization_id,workflow_id)
    references public.implementation_workflows(organization_id,id) on delete cascade,
  foreign key (organization_id,metric_id)
    references public.measurement_metrics(organization_id,id) on delete restrict
);

create index workflow_metrics_metric_idx
  on public.workflow_metrics (organization_id,metric_id);

alter table public.workflow_metrics enable row level security;
revoke all on public.workflow_metrics from anon, authenticated;
grant select,insert,update,delete on public.workflow_metrics to authenticated;
create policy "Internal users manage workflow metrics"
  on public.workflow_metrics for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create or replace function private.can_view_client_workflow(
  target_organization_id uuid,
  target_workflow_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_member(target_organization_id) and exists (
    select 1
    from public.implementation_workflows workflow
    left join public.implementations implementation
      on implementation.organization_id = workflow.organization_id
     and implementation.id = workflow.implementation_id
    left join public.initiatives initiative
      on initiative.organization_id = implementation.organization_id
     and initiative.id = implementation.initiative_id
    where workflow.organization_id = target_organization_id
      and workflow.id = target_workflow_id
      and workflow.client_visible
      and (
        workflow.implementation_id is null
        or (implementation.client_visible and initiative.client_visible)
      )
  );
$$;
revoke all on function private.can_view_client_workflow(uuid,uuid) from public, anon, authenticated;
grant execute on function private.can_view_client_workflow(uuid,uuid) to authenticated;

create or replace function public.get_client_workflow_monitoring(target_organization_id uuid)
returns table (
  workflow_id uuid,
  implementation_id uuid,
  workflow_name text,
  purpose text,
  environment text,
  operational_status text,
  monitoring_status text,
  last_successful_execution_at timestamptz,
  last_failure_at timestamptz,
  last_reported_at timestamptz,
  last_execution_status text,
  execution_count bigint,
  success_count bigint,
  failure_count bigint,
  average_duration_ms numeric
)
language sql stable security definer set search_path = '' as $$
  select
    workflow.id,
    workflow.implementation_id,
    workflow.workflow_name,
    workflow.purpose,
    workflow.environment,
    workflow.operational_status,
    workflow.monitoring_status,
    workflow.last_successful_execution_at,
    workflow.last_failure_at,
    latest.last_event_at,
    latest.status,
    count(execution.id),
    count(execution.id) filter (where execution.status = 'successful'),
    count(execution.id) filter (where execution.status = 'failed'),
    avg(execution.duration_ms) filter (where execution.duration_ms is not null)
  from public.implementation_workflows workflow
  left join public.implementations implementation
    on implementation.organization_id = workflow.organization_id
   and implementation.id = workflow.implementation_id
  left join public.initiatives initiative
    on initiative.organization_id = implementation.organization_id
   and initiative.id = implementation.initiative_id
  left join public.workflow_executions execution
    on execution.organization_id = workflow.organization_id
   and execution.workflow_id = workflow.id
  left join lateral (
    select observed.status, observed.last_event_at
    from public.workflow_executions observed
    where observed.organization_id = workflow.organization_id
      and observed.workflow_id = workflow.id
    order by observed.last_event_at desc, observed.id desc
    limit 1
  ) latest on true
  where workflow.organization_id = target_organization_id
    and private.is_org_member(target_organization_id)
    and workflow.client_visible
    and (
      workflow.implementation_id is null
      or (implementation.client_visible and initiative.client_visible)
    )
    and workflow.operational_status <> 'retired'
  group by workflow.id, latest.last_event_at, latest.status
  order by workflow.workflow_name;
$$;
revoke all on function public.get_client_workflow_monitoring(uuid) from public, anon;
grant execute on function public.get_client_workflow_monitoring(uuid) to authenticated;

-- Registration and initial credential creation are one transaction. The raw
-- token is generated by the server action; only its SHA-256 digest reaches
-- Postgres. SECURITY INVOKER keeps both RLS and the explicit role check active.
create function public.register_monitored_workflow(
  target_organization_id uuid,
  workflow_platform text,
  workflow_instance_reference text,
  workflow_external_id text,
  workflow_display_name text,
  workflow_https_url text,
  workflow_purpose text,
  target_implementation_id uuid,
  target_process_id uuid,
  target_owner_membership_id uuid,
  target_metric_id uuid,
  publish_to_client boolean,
  new_credential_id uuid,
  new_secret_hash text,
  new_token_hint text,
  credential_label text default 'n8n execution reporter',
  credential_rate_limit integer default 120
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  created_workflow uuid;
begin
  if not private.has_org_role(
    target_organization_id,
    array['delaro_admin','delaro_consultant']::public.organization_member_role[]
  ) then
    raise insufficient_privilege using message = 'Internal organization access required';
  end if;

  insert into public.implementation_workflows (
    organization_id,implementation_id,process_id,platform,instance_reference,
    external_workflow_id,workflow_name,workflow_url,purpose,environment,
    operational_status,owner_membership_id,monitoring_status,
    registration_source,client_visible
  ) values (
    target_organization_id,target_implementation_id,target_process_id,trim(workflow_platform),
    trim(workflow_instance_reference),trim(workflow_external_id),
    trim(workflow_display_name),nullif(trim(workflow_https_url),''),
    nullif(trim(workflow_purpose),''),'production','active',
    target_owner_membership_id,'configured','direct',publish_to_client
  ) returning id into created_workflow;

  if target_metric_id is not null then
    insert into public.workflow_metrics (organization_id,workflow_id,metric_id)
    values (target_organization_id,created_workflow,target_metric_id);
  end if;

  perform public.rotate_workflow_ingestion_credential(
    created_workflow,new_credential_id,new_secret_hash,new_token_hint,
    credential_label,credential_rate_limit,null
  );

  return created_workflow;
end $$;
revoke all on function public.register_monitored_workflow(
  uuid,text,text,text,text,text,text,uuid,uuid,uuid,uuid,boolean,uuid,text,text,text,integer
) from public, anon;
grant execute on function public.register_monitored_workflow(
  uuid,text,text,text,text,text,text,uuid,uuid,uuid,uuid,boolean,uuid,text,text,text,integer
) to authenticated;

-- A UI or direct Data API update cannot assert connectivity. The latest stored
-- authenticated execution is the evidence for connected/degraded state.
create function private.guard_workflow_monitoring_status()
returns trigger language plpgsql set search_path = '' as $$
declare latest_status text;
begin
  if new.monitoring_status not in ('connected','degraded') then
    return new;
  end if;

  select execution.status into latest_status
  from public.workflow_executions execution
  where execution.organization_id = new.organization_id
    and execution.workflow_id = new.id
  order by execution.last_event_at desc, execution.id desc
  limit 1;

  if latest_status is null
     or (new.monitoring_status = 'degraded' and latest_status <> 'failed')
     or (new.monitoring_status = 'connected' and latest_status = 'failed') then
    raise check_violation using message = 'Workflow monitoring status requires matching authenticated execution evidence';
  end if;
  return new;
end $$;

create trigger guard_workflow_monitoring_status
  before insert or update of monitoring_status on public.implementation_workflows
  for each row execute function private.guard_workflow_monitoring_status();

-- Recreate ingestion so the workflow status reflects the newest execution:
-- a latest failure is degraded; any other authenticated event is connected.
create or replace function public.ingest_n8n_execution_event(
  target_credential_id uuid,
  supplied_secret_hash text,
  external_event_key text,
  external_execution_key text,
  reported_event_type text,
  reported_status text,
  reported_occurred_at timestamptz,
  reported_started_at timestamptz,
  reported_finished_at timestamptz,
  reported_duration_ms bigint,
  reported_error_code text,
  reported_error_summary text,
  reported_source text,
  reported_payload_digest text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  credential public.workflow_ingestion_credentials%rowtype;
  inserted_event uuid;
  observed_execution uuid;
  current_window timestamptz := date_trunc('minute',clock_timestamp());
  window_count integer;
  latest_status text;
begin
  select * into credential
  from public.workflow_ingestion_credentials stored
  where stored.id = target_credential_id
    and stored.secret_hash = supplied_secret_hash
    and stored.status = 'active'
    and (stored.expires_at is null or stored.expires_at > clock_timestamp());
  if not found then
    raise insufficient_privilege using message = 'Invalid integration credential';
  end if;

  if length(external_event_key) not between 1 and 180
     or length(external_execution_key) not between 1 and 180
     or reported_event_type not in ('started','completed','failed','observed')
     or reported_status not in ('running','successful','failed','unknown')
     or reported_source not in ('n8n_workflow_reporter','n8n_error_trigger','n8n_api_poll')
     or reported_payload_digest !~ '^[0-9a-f]{64}$'
     or reported_occurred_at > clock_timestamp() + interval '5 minutes'
     or reported_occurred_at < clock_timestamp() - interval '365 days'
     or (reported_duration_ms is not null and reported_duration_ms not between 0 and 31536000000)
     or (reported_error_code is not null and length(reported_error_code) > 100)
     or (reported_error_summary is not null and length(reported_error_summary) > 500)
     or (reported_event_type = 'completed' and reported_status <> 'successful')
     or (reported_event_type = 'failed' and reported_status <> 'failed')
     or (reported_event_type = 'started' and reported_status not in ('running','unknown'))
     or (reported_status = 'successful' and (reported_error_code is not null or reported_error_summary is not null)) then
    raise data_exception using message = 'Invalid execution event';
  end if;

  update public.workflow_ingestion_credentials
    set last_used_at = clock_timestamp()
    where id = credential.id;

  insert into public.workflow_ingestion_rate_windows (
    credential_id,organization_id,window_started_at,request_count
  ) values (credential.id,credential.organization_id,current_window,1)
  on conflict (credential_id,window_started_at) do update
    set request_count = public.workflow_ingestion_rate_windows.request_count + 1
    where public.workflow_ingestion_rate_windows.request_count < credential.rate_limit_per_minute
  returning request_count into window_count;
  if window_count is null then
    raise program_limit_exceeded using message = 'Workflow event rate limit exceeded';
  end if;

  insert into public.workflow_execution_events (
    organization_id,workflow_id,credential_id,external_event_id,external_execution_id,
    event_type,execution_status,occurred_at,source,payload_digest,error_code,error_summary
  ) values (
    credential.organization_id,credential.workflow_id,credential.id,external_event_key,
    external_execution_key,reported_event_type,reported_status,reported_occurred_at,
    reported_source,reported_payload_digest,reported_error_code,reported_error_summary
  ) on conflict (organization_id,workflow_id,external_event_id) do nothing
  returning id into inserted_event;

  if inserted_event is null then
    select execution.id into observed_execution
    from public.workflow_executions execution
    where execution.organization_id = credential.organization_id
      and execution.workflow_id = credential.workflow_id
      and execution.external_execution_id = external_execution_key;
    return jsonb_build_object('accepted',true,'duplicate',true,'execution_id',observed_execution);
  end if;

  insert into public.workflow_executions (
    organization_id,workflow_id,external_execution_id,status,started_at,finished_at,
    duration_ms,error_code,error_summary,monitoring_source,first_event_at,last_event_at,last_received_at
  ) values (
    credential.organization_id,credential.workflow_id,external_execution_key,reported_status,
    coalesce(reported_started_at,case when reported_event_type = 'started' then reported_occurred_at end),
    coalesce(reported_finished_at,case when reported_status in ('successful','failed') then reported_occurred_at end),
    reported_duration_ms,reported_error_code,reported_error_summary,reported_source,
    reported_occurred_at,reported_occurred_at,clock_timestamp()
  ) on conflict (organization_id,workflow_id,external_execution_id) do update set
    status = case
      when public.workflow_executions.status in ('successful','failed') then public.workflow_executions.status
      when excluded.status in ('successful','failed') then excluded.status
      else excluded.status
    end,
    started_at = case
      when public.workflow_executions.started_at is null then excluded.started_at
      when excluded.started_at is null then public.workflow_executions.started_at
      else least(public.workflow_executions.started_at,excluded.started_at)
    end,
    finished_at = case
      when public.workflow_executions.status in ('successful','failed') then public.workflow_executions.finished_at
      when excluded.status in ('successful','failed') then excluded.finished_at
      else public.workflow_executions.finished_at
    end,
    duration_ms = case
      when public.workflow_executions.status in ('successful','failed') then public.workflow_executions.duration_ms
      when excluded.status in ('successful','failed') then excluded.duration_ms
      else coalesce(excluded.duration_ms,public.workflow_executions.duration_ms)
    end,
    error_code = case
      when public.workflow_executions.status in ('successful','failed') then public.workflow_executions.error_code
      when excluded.status = 'failed' then excluded.error_code
      else public.workflow_executions.error_code
    end,
    error_summary = case
      when public.workflow_executions.status in ('successful','failed') then public.workflow_executions.error_summary
      when excluded.status = 'failed' then excluded.error_summary
      else public.workflow_executions.error_summary
    end,
    monitoring_source = case
      when excluded.last_event_at >= public.workflow_executions.last_event_at then excluded.monitoring_source
      else public.workflow_executions.monitoring_source
    end,
    first_event_at = least(public.workflow_executions.first_event_at,excluded.first_event_at),
    last_event_at = greatest(public.workflow_executions.last_event_at,excluded.last_event_at),
    last_received_at = clock_timestamp(),
    updated_at = clock_timestamp()
  returning id into observed_execution;

  select execution.status into latest_status
  from public.workflow_executions execution
  where execution.organization_id = credential.organization_id
    and execution.workflow_id = credential.workflow_id
  order by execution.last_event_at desc, execution.id desc
  limit 1;

  update public.implementation_workflows workflow set
    monitoring_status = case when latest_status = 'failed' then 'degraded' else 'connected' end,
    last_successful_execution_at = case when reported_status = 'successful'
      then greatest(coalesce(workflow.last_successful_execution_at,'-infinity'::timestamptz),reported_occurred_at)
      else workflow.last_successful_execution_at end,
    last_failure_at = case when reported_status = 'failed'
      then greatest(coalesce(workflow.last_failure_at,'-infinity'::timestamptz),reported_occurred_at)
      else workflow.last_failure_at end,
    updated_at = clock_timestamp()
  where workflow.organization_id = credential.organization_id
    and workflow.id = credential.workflow_id;

  update public.implementations implementation set
    monitoring_status = 'connected',
    operational_health = case
      when reported_occurred_at >= coalesce(implementation.last_observed_at,'-infinity'::timestamptz)
        and reported_status = 'successful' then 'healthy'
      when reported_occurred_at >= coalesce(implementation.last_observed_at,'-infinity'::timestamptz)
        and reported_status = 'failed' then 'degraded'
      else implementation.operational_health end,
    last_observed_status = case
      when reported_occurred_at >= coalesce(implementation.last_observed_at,'-infinity'::timestamptz)
        then reported_status else implementation.last_observed_status end,
    last_observed_at = greatest(coalesce(implementation.last_observed_at,'-infinity'::timestamptz),reported_occurred_at),
    updated_at = clock_timestamp()
  from public.implementation_workflows workflow
  where workflow.organization_id = credential.organization_id
    and workflow.id = credential.workflow_id
    and implementation.organization_id = workflow.organization_id
    and implementation.id = workflow.implementation_id;

  delete from public.workflow_ingestion_rate_windows
    where window_started_at < clock_timestamp() - interval '10 minutes';

  return jsonb_build_object('accepted',true,'duplicate',false,'execution_id',observed_execution);
end $$;
revoke all on function public.ingest_n8n_execution_event(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,bigint,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.ingest_n8n_execution_event(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,bigint,text,text,text,text)
  to service_role;
