-- Stage 3A: authenticated, tenant-scoped n8n execution observability.
-- Credentials are workflow-scoped and stored only as SHA-256 hashes. Execution
-- payloads are intentionally not retained.

create table public.workflow_ingestion_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  label text not null check (length(trim(label)) between 2 and 120),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null check (length(token_hint) between 4 and 16),
  status text not null default 'active' check (status in ('active','revoked')),
  rate_limit_per_minute integer not null default 120 check (rate_limit_per_minute between 1 and 1000),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_membership_id uuid not null,
  revoked_by_membership_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (expires_at is null or expires_at > created_at),
  foreign key (organization_id, workflow_id)
    references public.implementation_workflows(organization_id, id) on delete cascade,
  foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, revoked_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create unique index workflow_ingestion_credentials_one_active_idx
  on public.workflow_ingestion_credentials (organization_id, workflow_id)
  where status = 'active';

create table public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  external_execution_id text not null check (length(trim(external_execution_id)) between 1 and 180),
  status text not null default 'unknown' check (status in ('running','successful','failed','unknown')),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms between 0 and 31536000000),
  error_code text check (error_code is null or length(error_code) <= 100),
  error_summary text check (error_summary is null or length(error_summary) <= 500),
  monitoring_source text not null check (monitoring_source in ('n8n_workflow_reporter','n8n_error_trigger','n8n_api_poll')),
  first_event_at timestamptz not null,
  last_event_at timestamptz not null,
  last_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, workflow_id, external_execution_id),
  check (finished_at is null or started_at is null or finished_at >= started_at),
  check (status <> 'successful' or (error_code is null and error_summary is null)),
  foreign key (organization_id, workflow_id)
    references public.implementation_workflows(organization_id, id) on delete cascade
);

create index workflow_executions_recent_idx
  on public.workflow_executions (organization_id, workflow_id, last_event_at desc);
create index workflow_executions_status_recent_idx
  on public.workflow_executions (organization_id, status, last_event_at desc);

create table public.workflow_execution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  credential_id uuid not null,
  external_event_id text not null check (length(trim(external_event_id)) between 1 and 180),
  external_execution_id text not null check (length(trim(external_execution_id)) between 1 and 180),
  event_type text not null check (event_type in ('started','completed','failed','observed')),
  execution_status text not null check (execution_status in ('running','successful','failed','unknown')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null check (source in ('n8n_workflow_reporter','n8n_error_trigger','n8n_api_poll')),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  error_code text check (error_code is null or length(error_code) <= 100),
  error_summary text check (error_summary is null or length(error_summary) <= 500),
  unique (organization_id, workflow_id, external_event_id),
  foreign key (organization_id, workflow_id)
    references public.implementation_workflows(organization_id, id) on delete cascade,
  foreign key (organization_id, credential_id)
    references public.workflow_ingestion_credentials(organization_id, id) on delete restrict
);

create index workflow_execution_events_audit_idx
  on public.workflow_execution_events (organization_id, workflow_id, received_at desc);

create table public.workflow_ingestion_rate_windows (
  credential_id uuid not null references public.workflow_ingestion_credentials(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (credential_id, window_started_at),
  foreign key (organization_id, credential_id)
    references public.workflow_ingestion_credentials(organization_id, id) on delete cascade
);

create table public.workflow_integration_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  credential_id uuid,
  action text not null check (action in ('credential_created','credential_rotated','credential_revoked')),
  actor_membership_id uuid not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  foreign key (organization_id, workflow_id)
    references public.implementation_workflows(organization_id, id) on delete cascade,
  foreign key (organization_id, credential_id)
    references public.workflow_ingestion_credentials(organization_id, id) on delete set null (credential_id),
  foreign key (organization_id, actor_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

alter table public.workflow_ingestion_credentials enable row level security;
alter table public.workflow_executions enable row level security;
alter table public.workflow_execution_events enable row level security;
alter table public.workflow_ingestion_rate_windows enable row level security;
alter table public.workflow_integration_audit enable row level security;

revoke all on public.workflow_ingestion_credentials, public.workflow_executions,
  public.workflow_execution_events, public.workflow_ingestion_rate_windows,
  public.workflow_integration_audit from anon, authenticated;
grant select,insert,update on public.workflow_ingestion_credentials to authenticated;
grant select on public.workflow_executions, public.workflow_execution_events,
  public.workflow_integration_audit to authenticated;

create policy "Internal users manage workflow ingestion credentials"
  on public.workflow_ingestion_credentials for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Internal users read workflow execution events"
  on public.workflow_execution_events for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Internal users read workflow integration audit"
  on public.workflow_integration_audit for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Internal users read workflow executions"
  on public.workflow_executions for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create function private.can_view_client_workflow(target_organization_id uuid, target_workflow_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_member(target_organization_id) and exists (
    select 1
    from public.implementation_workflows workflow
    join public.implementations implementation
      on implementation.organization_id = workflow.organization_id
     and implementation.id = workflow.implementation_id
    join public.initiatives initiative
      on initiative.organization_id = implementation.organization_id
     and initiative.id = implementation.initiative_id
    where workflow.organization_id = target_organization_id
      and workflow.id = target_workflow_id
      and implementation.client_visible
      and initiative.client_visible
  );
$$;
revoke all on function private.can_view_client_workflow(uuid,uuid) from public, anon, authenticated;
grant execute on function private.can_view_client_workflow(uuid,uuid) to authenticated;

create policy "Members read published workflow executions"
  on public.workflow_executions for select to authenticated
  using (private.can_view_client_workflow(organization_id,workflow_id));

-- Client-safe workflow metadata projection. Technical instance references and
-- external workflow identifiers remain private to Delaro operators.
create function public.get_client_workflow_monitoring(target_organization_id uuid)
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
  join public.implementations implementation
    on implementation.organization_id = workflow.organization_id
   and implementation.id = workflow.implementation_id
  join public.initiatives initiative
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
    and implementation.client_visible
    and initiative.client_visible
    and workflow.operational_status <> 'retired'
  group by workflow.id, latest.last_event_at, latest.status
  order by workflow.workflow_name;
$$;
revoke all on function public.get_client_workflow_monitoring(uuid) from public, anon;
grant execute on function public.get_client_workflow_monitoring(uuid) to authenticated;

create function public.rotate_workflow_ingestion_credential(
  target_workflow_id uuid,
  new_credential_id uuid,
  new_secret_hash text,
  new_token_hint text,
  credential_label text default 'n8n execution reporter',
  credential_rate_limit integer default 120,
  credential_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_organization uuid;
  actor_membership uuid;
  previous_credential uuid;
  created_credential uuid;
begin
  if new_secret_hash !~ '^[0-9a-f]{64}$'
     or length(new_token_hint) not between 4 and 16
     or length(trim(credential_label)) not between 2 and 120
     or credential_rate_limit not between 1 and 1000
     or (credential_expires_at is not null and credential_expires_at <= now()) then
    raise exception 'Invalid workflow credential configuration';
  end if;

  select workflow.organization_id into target_organization
  from public.implementation_workflows workflow
  where workflow.id = target_workflow_id;
  if target_organization is null
     or not private.has_org_role(target_organization,array['delaro_admin','delaro_consultant']::public.organization_member_role[]) then
    raise exception 'Workflow is unavailable';
  end if;

  select membership.id into actor_membership
  from public.organization_memberships membership
  where membership.organization_id = target_organization
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('delaro_admin','delaro_consultant')
  order by membership.created_at
  limit 1;

  select credential.id into previous_credential
  from public.workflow_ingestion_credentials credential
  where credential.organization_id = target_organization
    and credential.workflow_id = target_workflow_id
    and credential.status = 'active'
  for update;

  if previous_credential is not null then
    update public.workflow_ingestion_credentials
      set status = 'revoked', revoked_at = now(), revoked_by_membership_id = actor_membership
      where id = previous_credential;
  end if;

  insert into public.workflow_ingestion_credentials (
    id,organization_id,workflow_id,label,secret_hash,token_hint,rate_limit_per_minute,
    expires_at,created_by_membership_id
  ) values (
    new_credential_id,target_organization,target_workflow_id,trim(credential_label),new_secret_hash,
    new_token_hint,credential_rate_limit,credential_expires_at,actor_membership
  ) returning id into created_credential;

  insert into public.workflow_integration_audit (
    organization_id,workflow_id,credential_id,action,actor_membership_id,details
  ) values (
    target_organization,target_workflow_id,created_credential,
    case when previous_credential is null then 'credential_created' else 'credential_rotated' end,
    actor_membership,jsonb_build_object('previous_credential_id',previous_credential)
  );
  return created_credential;
end $$;
revoke all on function public.rotate_workflow_ingestion_credential(uuid,uuid,text,text,text,integer,timestamptz) from public, anon;
grant execute on function public.rotate_workflow_ingestion_credential(uuid,uuid,text,text,text,integer,timestamptz) to authenticated;

create function public.revoke_workflow_ingestion_credential(target_credential_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_credential public.workflow_ingestion_credentials%rowtype;
  actor_membership uuid;
begin
  select * into target_credential
  from public.workflow_ingestion_credentials credential
  where credential.id = target_credential_id
  for update;
  if not found
     or not private.has_org_role(target_credential.organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]) then
    raise exception 'Credential is unavailable';
  end if;
  select membership.id into actor_membership
  from public.organization_memberships membership
  where membership.organization_id = target_credential.organization_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('delaro_admin','delaro_consultant')
  order by membership.created_at limit 1;
  if target_credential.status = 'active' then
    update public.workflow_ingestion_credentials
      set status = 'revoked', revoked_at = now(), revoked_by_membership_id = actor_membership
      where id = target_credential.id;
    insert into public.workflow_integration_audit (
      organization_id,workflow_id,credential_id,action,actor_membership_id
    ) values (
      target_credential.organization_id,target_credential.workflow_id,target_credential.id,
      'credential_revoked',actor_membership
    );
  end if;
end $$;
revoke all on function public.revoke_workflow_ingestion_credential(uuid) from public, anon;
grant execute on function public.revoke_workflow_ingestion_credential(uuid) to authenticated;

create function public.ingest_n8n_execution_event(
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

  update public.implementation_workflows workflow set
    monitoring_status = 'connected',
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

alter publication supabase_realtime add table public.workflow_executions;
