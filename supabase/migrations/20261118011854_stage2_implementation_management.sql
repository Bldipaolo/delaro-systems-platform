-- Stage 2: implementation and systems management.
-- This layer extends initiatives; it does not replace them or execute external workflows.

create table public.implementations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid not null,
  name text not null check (length(trim(name)) between 3 and 180),
  implementation_type text not null check (implementation_type in (
    'n8n_automation','ai_processing','integration','internal_software','reporting_dashboard',
    'data_infrastructure','process_redesign','human_decision_system','other'
  )),
  operational_problem text not null check (length(trim(operational_problem)) between 10 and 4000),
  desired_outcome text not null check (length(trim(desired_outcome)) between 10 and 4000),
  client_solution_summary text,
  client_progress_summary text,
  expected_business_impact text,
  owner_membership_id uuid,
  operational_owner_membership_id uuid,
  escalation_owner_membership_id uuid,
  status text not null default 'planning' check (status in (
    'planning','architecture','development','internal_testing','client_acceptance',
    'ready_for_deployment','deployed','monitoring','paused','retired'
  )),
  status_before_pause text check (status_before_pause is null or status_before_pause in (
    'planning','architecture','development','internal_testing','client_acceptance',
    'ready_for_deployment','deployed','monitoring'
  )),
  planned_deployment_date date,
  actual_deployment_date date,
  acceptance_decision_id uuid,
  monitoring_status text not null default 'not_connected'
    check (monitoring_status in ('not_connected','configured','connected','degraded','disabled')),
  operational_health text not null default 'unknown'
    check (operational_health in ('unknown','healthy','degraded','unavailable','paused')),
  last_observed_status text,
  last_observed_at timestamptz,
  expected_operating_cadence text,
  support_responsibility text,
  manual_intervention_summary text,
  client_visible boolean not null default false,
  created_by_membership_id uuid not null,
  updated_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, initiative_id, id),
  check ((last_observed_status is null) = (last_observed_at is null)),
  check (status <> 'monitoring' or operational_owner_membership_id is not null),
  check (status not in ('deployed','monitoring') or actual_deployment_date is not null),
  foreign key (organization_id, initiative_id)
    references public.initiatives(organization_id, id) on delete restrict,
  foreign key (organization_id, owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (owner_membership_id),
  foreign key (organization_id, operational_owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (operational_owner_membership_id),
  foreign key (organization_id, escalation_owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (escalation_owner_membership_id),
  foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, updated_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.implementation_internal_details (
  implementation_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  technical_scope text,
  operational_scope text,
  architecture_summary text,
  blockers text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade
);

create table public.implementation_architectures (
  implementation_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  authentication_method text,
  credential_owner text not null default 'client'
    check (credential_owner in ('client','delaro','shared_responsibility','not_applicable')),
  failure_conditions text,
  retry_behavior text,
  logging_strategy text,
  monitoring_strategy text,
  security_considerations text,
  manual_fallback_procedure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade
);

create table public.implementation_architecture_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  category text not null check (category in ('input','processing','decision','output')),
  item_type text not null check (length(trim(item_type)) between 2 and 80),
  name text not null check (length(trim(name)) between 2 and 180),
  description text,
  system_id uuid,
  sequence integer not null default 0 check (sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, system_id)
    references public.systems(organization_id, id) on delete set null (system_id)
);

create table public.implementation_processes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  process_id uuid not null,
  relationship text,
  created_at timestamptz not null default now(),
  primary key (organization_id, implementation_id, process_id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, process_id)
    references public.processes(organization_id, id) on delete restrict
);

create table public.implementation_systems (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  system_id uuid not null,
  relationship text,
  created_at timestamptz not null default now(),
  primary key (organization_id, implementation_id, system_id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, system_id)
    references public.systems(organization_id, id) on delete restrict
);

create table public.implementation_metrics (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  metric_id uuid not null,
  measurement_role text,
  created_at timestamptz not null default now(),
  primary key (organization_id, implementation_id, metric_id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, metric_id)
    references public.measurement_metrics(organization_id, id) on delete restrict
);

create table public.implementation_dependencies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  depends_on_implementation_id uuid not null,
  dependency_type text not null default 'finish_to_start'
    check (dependency_type in ('finish_to_start','start_to_start','external','informational')),
  description text,
  created_at timestamptz not null default now(),
  primary key (organization_id, implementation_id, depends_on_implementation_id),
  check (implementation_id <> depends_on_implementation_id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, depends_on_implementation_id)
    references public.implementations(organization_id, id) on delete restrict
);

create table public.implementation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  process_id uuid,
  platform text not null default 'n8n' check (length(trim(platform)) between 2 and 80),
  instance_reference text not null check (length(trim(instance_reference)) between 2 and 300),
  external_workflow_id text not null check (length(trim(external_workflow_id)) between 1 and 180),
  workflow_name text not null check (length(trim(workflow_name)) between 2 and 180),
  purpose text not null check (length(trim(purpose)) between 5 and 2000),
  environment text not null check (environment in ('development','staging','production','other')),
  operational_status text not null default 'documented'
    check (operational_status in ('documented','in_development','testing','active','paused','failed','retired')),
  owner_membership_id uuid,
  last_successful_execution_at timestamptz,
  last_failure_at timestamptz,
  monitoring_status text not null default 'not_connected'
    check (monitoring_status in ('not_connected','configured','connected','degraded','disabled')),
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, platform, instance_reference, external_workflow_id, environment),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, process_id)
    references public.processes(organization_id, id) on delete set null (process_id),
  foreign key (organization_id, owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (owner_membership_id)
);

create table public.implementation_acceptance_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  title text not null check (length(trim(title)) between 3 and 180),
  expected_behavior text not null check (length(trim(expected_behavior)) between 5 and 3000),
  required boolean not null default true,
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected')),
  reviewed_by_membership_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((review_status = 'pending') = (reviewed_by_membership_id is null and reviewed_at is null)),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, reviewed_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.implementation_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  name text not null check (length(trim(name)) between 3 and 180),
  category text not null check (category in (
    'functional','integration','data_accuracy','error_handling','permission','security','performance','client_acceptance'
  )),
  expected_behavior text not null check (length(trim(expected_behavior)) between 5 and 3000),
  actual_outcome text,
  status text not null default 'pending' check (status in ('pending','passed','failed','blocked')),
  required boolean not null default true,
  executed_at timestamptz,
  tester_membership_id uuid,
  evidence_reference text,
  notes text,
  required_remediation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((status = 'pending') = (executed_at is null and tester_membership_id is null)),
  check (status <> 'passed' or nullif(trim(coalesce(actual_outcome,'')), '') is not null),
  check (status not in ('failed','blocked') or nullif(trim(coalesce(required_remediation,'')), '') is not null),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, tester_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.implementation_deployments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  version text not null check (length(trim(version)) between 1 and 80),
  environment text not null check (environment in ('staging','production','other')),
  deployed_at timestamptz not null,
  deployed_by_membership_id uuid not null,
  external_reference text,
  configuration_requirements text,
  acceptance_status text not null check (acceptance_status in ('approved','conditional')),
  known_limitations text,
  rollback_procedure text not null check (length(trim(rollback_procedure)) between 5 and 4000),
  operational_owner_membership_id uuid not null,
  support_responsibility text not null check (length(trim(support_responsibility)) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, implementation_id, version, environment),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete restrict,
  foreign key (organization_id, deployed_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, operational_owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.implementation_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  title text not null check (length(trim(title)) between 2 and 180),
  reference_type text not null check (reference_type in ('document','runbook','diagram','repository','external','other')),
  reference text not null check (length(trim(reference)) between 2 and 1000),
  description text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade
);

create table public.implementation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  event_type text not null check (event_type in ('created','status_changed','published','unpublished','deployment_recorded')),
  from_status text,
  to_status text,
  summary text not null,
  actor_membership_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, actor_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

-- Extend existing initiative milestones rather than creating a second task system.
alter table public.initiative_milestones
  add column implementation_id uuid,
  add column client_visible boolean not null default false;
alter table public.initiative_milestones
  add constraint initiative_milestones_org_id_id_key unique (organization_id, id),
  add constraint initiative_milestones_org_initiative_id_key unique (organization_id, initiative_id, id),
  add constraint initiative_milestones_org_implementation_id_key unique (organization_id, implementation_id, id),
  add constraint initiative_milestones_implementation_fk foreign key (organization_id, initiative_id, implementation_id)
    references public.implementations(organization_id, initiative_id, id) on delete cascade;
update public.initiative_milestones milestone
set client_visible = true
where exists (
  select 1 from public.initiatives initiative
  where initiative.organization_id = milestone.organization_id
    and initiative.id = milestone.initiative_id
    and initiative.client_visible
);

create table public.implementation_milestone_details (
  milestone_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  acceptance_requirements text,
  blocker_details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, implementation_id, milestone_id)
    references public.initiative_milestones(organization_id, implementation_id, id) on delete cascade
);

create table public.implementation_milestone_dependencies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  implementation_id uuid not null,
  milestone_id uuid not null,
  depends_on_milestone_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, implementation_id, milestone_id, depends_on_milestone_id),
  check (milestone_id <> depends_on_milestone_id),
  foreign key (organization_id, implementation_id)
    references public.implementations(organization_id, id) on delete cascade,
  foreign key (organization_id, implementation_id, milestone_id)
    references public.initiative_milestones(organization_id, implementation_id, id) on delete cascade,
  foreign key (organization_id, implementation_id, depends_on_milestone_id)
    references public.initiative_milestones(organization_id, implementation_id, id) on delete restrict
);

alter table public.implementations
  add constraint implementations_acceptance_decision_fk
  foreign key (organization_id, acceptance_decision_id)
  references public.decisions(organization_id, id) on delete set null (acceptance_decision_id);

create index implementations_org_status_idx on public.implementations (organization_id, status, updated_at desc);
create index implementations_initiative_idx on public.implementations (organization_id, initiative_id);
create index implementations_owner_idx on public.implementations (organization_id, owner_membership_id);
create index architecture_items_implementation_idx on public.implementation_architecture_items (organization_id, implementation_id, category, sequence);
create index workflows_implementation_idx on public.implementation_workflows (organization_id, implementation_id, environment);
create index tests_implementation_idx on public.implementation_tests (organization_id, implementation_id, required, status);
create index criteria_implementation_idx on public.implementation_acceptance_criteria (organization_id, implementation_id, required, review_status);
create index deployments_implementation_idx on public.implementation_deployments (organization_id, implementation_id, deployed_at desc);
create index events_implementation_idx on public.implementation_events (organization_id, implementation_id, occurred_at desc);

create trigger implementations_updated_at before update on public.implementations
  for each row execute function public.set_updated_at();
create trigger implementation_internal_details_updated_at before update on public.implementation_internal_details
  for each row execute function public.set_updated_at();
create trigger implementation_architectures_updated_at before update on public.implementation_architectures
  for each row execute function public.set_updated_at();
create trigger implementation_architecture_items_updated_at before update on public.implementation_architecture_items
  for each row execute function public.set_updated_at();
create trigger implementation_workflows_updated_at before update on public.implementation_workflows
  for each row execute function public.set_updated_at();
create trigger implementation_acceptance_criteria_updated_at before update on public.implementation_acceptance_criteria
  for each row execute function public.set_updated_at();
create trigger implementation_tests_updated_at before update on public.implementation_tests
  for each row execute function public.set_updated_at();
create trigger implementation_references_updated_at before update on public.implementation_references
  for each row execute function public.set_updated_at();
create trigger implementation_milestone_details_updated_at before update on public.implementation_milestone_details
  for each row execute function public.set_updated_at();

-- Critical lifecycle rules are database invariants so Data API writes cannot bypass them.
create function private.stage2_internal_actor(target_org uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid;
begin
  select id into actor from public.organization_memberships
  where organization_id = target_org
    and user_id = (select auth.uid())
    and status = 'active'
    and role in ('delaro_admin','delaro_consultant');
  if actor is null then raise exception 'Active internal implementation owner required'; end if;
  return actor;
end $$;
revoke all on function private.stage2_internal_actor(uuid) from public, anon, authenticated;

create function private.stage2_initiative_is_approved(target_org uuid, target_initiative uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.decisions decision
    join public.approvals approval
      on approval.organization_id = decision.organization_id
     and approval.decision_id = decision.id
    where decision.organization_id = target_org
      and decision.initiative_id = target_initiative
      and decision.kind = 'approval'
      and decision.client_visible
      and decision.status = 'approved'
      and decision.decided_at is not null
      and approval.status = 'approved'
      and approval.responded_at is not null
      and approval.responded_by_membership_id is not null
  );
$$;
revoke all on function private.stage2_initiative_is_approved(uuid,uuid) from public, anon, authenticated;

create function private.stage2_implementation_is_ready(target_org uuid, target_implementation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.implementations implementation
    join public.decisions decision
      on decision.organization_id = implementation.organization_id
     and decision.id = implementation.acceptance_decision_id
    where implementation.organization_id = target_org
      and implementation.id = target_implementation
      and decision.initiative_id = implementation.initiative_id
      and decision.kind = 'approval'
      and decision.client_visible
      and decision.status = 'approved'
      and decision.decided_at is not null
  )
  and exists (
    select 1 from public.implementation_acceptance_criteria criterion
    where criterion.organization_id = target_org
      and criterion.implementation_id = target_implementation
      and criterion.required
  )
  and not exists (
    select 1 from public.implementation_acceptance_criteria criterion
    where criterion.organization_id = target_org
      and criterion.implementation_id = target_implementation
      and criterion.required
      and criterion.review_status <> 'accepted'
  )
  and exists (
    select 1 from public.implementation_tests test
    where test.organization_id = target_org
      and test.implementation_id = target_implementation
      and test.required
  )
  and not exists (
    select 1 from public.implementation_tests test
    where test.organization_id = target_org
      and test.implementation_id = target_implementation
      and test.required
      and test.status <> 'passed'
  );
$$;
revoke all on function private.stage2_implementation_is_ready(uuid,uuid) from public, anon, authenticated;

create function private.stage2_guard_implementation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  allowed boolean := false;
  deployment_date date;
begin
  actor := private.stage2_internal_actor(new.organization_id);
  if tg_op = 'INSERT' then
    new.created_by_membership_id := actor;
    new.updated_by_membership_id := actor;
  else
    if (new.organization_id,new.initiative_id,new.created_by_membership_id) is distinct from
       (old.organization_id,old.initiative_id,old.created_by_membership_id) then
      raise exception 'Implementation ownership is immutable';
    end if;
    new.updated_by_membership_id := actor;
    if new.status is distinct from old.status then
      allowed := case old.status
        when 'planning' then new.status in ('architecture','paused','retired')
        when 'architecture' then new.status in ('development','paused','retired')
        when 'development' then new.status in ('internal_testing','paused')
        when 'internal_testing' then new.status in ('development','client_acceptance','paused')
        when 'client_acceptance' then new.status in ('development','internal_testing','ready_for_deployment','paused')
        when 'ready_for_deployment' then new.status in ('client_acceptance','deployed','paused')
        when 'deployed' then new.status in ('monitoring','paused','retired')
        when 'monitoring' then new.status in ('paused','retired')
        when 'paused' then new.status = old.status_before_pause or new.status = 'retired'
        else false
      end;
      if not allowed then raise exception 'Invalid implementation lifecycle transition'; end if;
      if new.status = 'paused' then new.status_before_pause := old.status;
      elsif old.status = 'paused' then new.status_before_pause := null;
      end if;
    end if;
  end if;

  if new.status in ('development','internal_testing','client_acceptance','ready_for_deployment','deployed','monitoring')
     and not private.stage2_initiative_is_approved(new.organization_id,new.initiative_id) then
    raise exception 'Approved parent improvement required before implementation work';
  end if;
  if new.status in ('ready_for_deployment','deployed','monitoring')
     and not private.stage2_implementation_is_ready(new.organization_id,new.id) then
    raise exception 'Required tests, acceptance criteria, and client acceptance must pass before deployment readiness';
  end if;
  if new.status in ('deployed','monitoring') then
    select deployed_at::date into deployment_date
    from public.implementation_deployments
    where organization_id = new.organization_id
      and implementation_id = new.id
      and acceptance_status = 'approved'
    order by deployed_at desc limit 1;
    if deployment_date is null then raise exception 'An approved deployment record is required'; end if;
    new.actual_deployment_date := deployment_date;
  end if;
  if new.status = 'monitoring'
     and (new.operational_owner_membership_id is null or nullif(trim(coalesce(new.support_responsibility,'')), '') is null) then
    raise exception 'Monitoring requires an operational owner and support responsibility';
  end if;
  return new;
end $$;
revoke all on function private.stage2_guard_implementation() from public, anon, authenticated;
create trigger stage2_implementation_guard before insert or update on public.implementations
  for each row execute function private.stage2_guard_implementation();

create function private.stage2_guard_review_attribution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.review_status = 'pending' then
    new.reviewed_by_membership_id := null;
    new.reviewed_at := null;
  elsif tg_op = 'INSERT' or new.review_status is distinct from old.review_status then
    new.reviewed_by_membership_id := private.stage2_internal_actor(new.organization_id);
    new.reviewed_at := now();
  end if;
  return new;
end $$;
revoke all on function private.stage2_guard_review_attribution() from public, anon, authenticated;
create trigger stage2_acceptance_review_guard before insert or update on public.implementation_acceptance_criteria
  for each row execute function private.stage2_guard_review_attribution();

create function private.stage2_guard_test_attribution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    new.tester_membership_id := null;
    new.executed_at := null;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    new.tester_membership_id := private.stage2_internal_actor(new.organization_id);
    new.executed_at := now();
  end if;
  return new;
end $$;
revoke all on function private.stage2_guard_test_attribution() from public, anon, authenticated;
create trigger stage2_test_attribution_guard before insert or update on public.implementation_tests
  for each row execute function private.stage2_guard_test_attribution();

create function private.stage2_guard_deployment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  if tg_op <> 'INSERT' then raise exception 'Deployment history is immutable'; end if;
  actor := private.stage2_internal_actor(new.organization_id);
  if not exists (
    select 1 from public.implementations implementation
    where implementation.organization_id = new.organization_id
      and implementation.id = new.implementation_id
      and implementation.status = 'ready_for_deployment'
  ) or not private.stage2_implementation_is_ready(new.organization_id,new.implementation_id) then
    raise exception 'Implementation is not ready for deployment';
  end if;
  new.deployed_by_membership_id := actor;
  return new;
end $$;
revoke all on function private.stage2_guard_deployment() from public, anon, authenticated;
create trigger stage2_deployment_guard before insert or update or delete on public.implementation_deployments
  for each row execute function private.stage2_guard_deployment();

create function private.stage2_record_implementation_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := new.updated_by_membership_id;
  if tg_op = 'INSERT' then
    insert into public.implementation_events
      (organization_id,implementation_id,event_type,to_status,summary,actor_membership_id)
    values (new.organization_id,new.id,'created',new.status,'Implementation record created',actor);
  else
    if new.status is distinct from old.status then
      insert into public.implementation_events
        (organization_id,implementation_id,event_type,from_status,to_status,summary,actor_membership_id)
      values (new.organization_id,new.id,'status_changed',old.status,new.status,'Implementation lifecycle changed',actor);
    end if;
    if new.client_visible is distinct from old.client_visible then
      insert into public.implementation_events
        (organization_id,implementation_id,event_type,from_status,to_status,summary,actor_membership_id)
      values (new.organization_id,new.id,case when new.client_visible then 'published' else 'unpublished' end,
        old.status,new.status,case when new.client_visible then 'Client progress published' else 'Client progress withdrawn' end,actor);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.stage2_record_implementation_event() from public, anon, authenticated;
create trigger stage2_implementation_audit after insert or update on public.implementations
  for each row execute function private.stage2_record_implementation_event();

create function private.stage2_record_deployment_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.implementation_events
    (organization_id,implementation_id,event_type,from_status,to_status,summary,actor_membership_id)
  values (new.organization_id,new.implementation_id,'deployment_recorded','ready_for_deployment','ready_for_deployment',
    'Deployment ' || new.version || ' recorded for ' || new.environment,new.deployed_by_membership_id);
  return new;
end $$;
revoke all on function private.stage2_record_deployment_event() from public, anon, authenticated;
create trigger stage2_deployment_audit after insert on public.implementation_deployments
  for each row execute function private.stage2_record_deployment_event();

-- Row security: internal users author all technical records. Clients only read
-- explicitly published implementation summaries, milestones, and references.
alter table public.implementations enable row level security;
alter table public.implementation_internal_details enable row level security;
alter table public.implementation_architectures enable row level security;
alter table public.implementation_architecture_items enable row level security;
alter table public.implementation_processes enable row level security;
alter table public.implementation_systems enable row level security;
alter table public.implementation_metrics enable row level security;
alter table public.implementation_dependencies enable row level security;
alter table public.implementation_workflows enable row level security;
alter table public.implementation_acceptance_criteria enable row level security;
alter table public.implementation_tests enable row level security;
alter table public.implementation_deployments enable row level security;
alter table public.implementation_references enable row level security;
alter table public.implementation_events enable row level security;
alter table public.implementation_milestone_details enable row level security;
alter table public.implementation_milestone_dependencies enable row level security;

revoke all on public.implementations, public.implementation_internal_details,
  public.implementation_architectures, public.implementation_architecture_items,
  public.implementation_processes, public.implementation_systems, public.implementation_metrics,
  public.implementation_dependencies, public.implementation_workflows,
  public.implementation_acceptance_criteria, public.implementation_tests,
  public.implementation_deployments, public.implementation_references,
  public.implementation_events, public.implementation_milestone_details,
  public.implementation_milestone_dependencies from anon, authenticated;

grant select,insert,update,delete on public.implementations, public.implementation_internal_details,
  public.implementation_architectures, public.implementation_architecture_items,
  public.implementation_processes, public.implementation_systems, public.implementation_metrics,
  public.implementation_dependencies, public.implementation_workflows,
  public.implementation_acceptance_criteria, public.implementation_tests,
  public.implementation_references, public.implementation_milestone_details,
  public.implementation_milestone_dependencies to authenticated;
grant select,insert on public.implementation_deployments, public.implementation_events to authenticated;

create policy "Internal users manage implementations" on public.implementations
  for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read published implementations" on public.implementations
  for select to authenticated
  using (client_visible and private.is_org_member(organization_id) and exists (
    select 1 from public.initiatives initiative
    where initiative.organization_id = implementations.organization_id
      and initiative.id = implementations.initiative_id
      and initiative.client_visible
  ));

create policy "Internal users manage implementation internal details" on public.implementation_internal_details
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation architectures" on public.implementation_architectures
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation architecture items" on public.implementation_architecture_items
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation processes" on public.implementation_processes
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation systems" on public.implementation_systems
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation metrics" on public.implementation_metrics
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation dependencies" on public.implementation_dependencies
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation workflows" on public.implementation_workflows
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation criteria" on public.implementation_acceptance_criteria
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation tests" on public.implementation_tests
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users record deployments" on public.implementation_deployments
  for insert to authenticated with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users read deployments" on public.implementation_deployments
  for select to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage implementation references" on public.implementation_references
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read published implementation references" on public.implementation_references
  for select to authenticated using (client_visible and private.is_org_member(organization_id) and exists (
    select 1 from public.implementations implementation
    where implementation.organization_id = implementation_references.organization_id
      and implementation.id = implementation_references.implementation_id
      and implementation.client_visible
  ));
create policy "Internal users read implementation events" on public.implementation_events
  for select to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage milestone details" on public.implementation_milestone_details
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users manage milestone dependencies" on public.implementation_milestone_dependencies
  for all to authenticated using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

drop policy "Members can view published initiative milestones" on public.initiative_milestones;
create policy "Members can view published initiative milestones" on public.initiative_milestones
  for select to authenticated using (
    client_visible and private.is_org_member(organization_id)
    and exists (
      select 1 from public.initiatives initiative
      where initiative.organization_id = initiative_milestones.organization_id
        and initiative.id = initiative_milestones.initiative_id
        and initiative.client_visible
    )
    and (
      implementation_id is null or exists (
        select 1 from public.implementations implementation
        where implementation.organization_id = initiative_milestones.organization_id
          and implementation.id = initiative_milestones.implementation_id
          and implementation.client_visible
      )
    )
  );
