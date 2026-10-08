-- Operational model. Composite foreign keys keep every relationship in one tenant.
-- Reuse the existing tenant membership and opportunity tables rather than copying identities.
alter table public.operational_areas add constraint operational_areas_org_id_id_key unique (organization_id, id);
alter table public.organization_memberships add constraint organization_memberships_org_id_id_key unique (organization_id, id);
alter table public.opportunities add constraint opportunities_org_id_id_key unique (organization_id, id);

create table public.operational_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  owner_membership_id uuid,
  sort_order integer not null default 0,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (owner_membership_id)
);

create table public.operational_team_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null,
  membership_id uuid not null,
  role_description text,
  created_at timestamptz not null default now(),
  primary key (organization_id, team_id, membership_id),
  foreign key (organization_id, team_id) references public.operational_teams(organization_id, id) on delete cascade,
  foreign key (organization_id, membership_id) references public.organization_memberships(organization_id, id) on delete cascade
);

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operational_area_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  owner_membership_id uuid,
  owner_team_id uuid,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'retired')),
  sort_order integer not null default 0,
  trigger_description text,
  expected_output text,
  downstream_effect text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, operational_area_id) references public.operational_areas(organization_id, id),
  foreign key (organization_id, owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (owner_membership_id),
  foreign key (organization_id, owner_team_id)
    references public.operational_teams(organization_id, id) on delete set null (owner_team_id)
);

create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid not null,
  step_type text not null check (step_type in ('input', 'process', 'decision', 'action', 'output')),
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order integer not null default 0,
  owner_membership_id uuid,
  owner_team_id uuid,
  automation_mode text not null default 'manual' check (automation_mode in ('manual', 'assisted', 'automated')),
  expected_duration_minutes numeric(12,2) check (expected_duration_minutes >= 0),
  actual_duration_minutes numeric(12,2) check (actual_duration_minutes >= 0),
  approval_required boolean not null default false,
  decision_criteria text,
  notes text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, process_id, id),
  foreign key (organization_id, process_id) references public.processes(organization_id, id) on delete cascade,
  foreign key (organization_id, owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (owner_membership_id),
  foreign key (organization_id, owner_team_id)
    references public.operational_teams(organization_id, id) on delete set null (owner_team_id)
);

create table public.systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text,
  vendor text,
  system_of_record boolean not null default false,
  description text,
  integration_status text not null default 'unknown'
    check (integration_status in ('unknown', 'not_integrated', 'planned', 'partial', 'integrated')),
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.process_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid not null,
  system_id uuid not null,
  usage_role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, process_id, system_id),
  foreign key (organization_id, process_id) references public.processes(organization_id, id) on delete cascade,
  foreign key (organization_id, system_id) references public.systems(organization_id, id) on delete cascade
);

create table public.process_step_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  step_id uuid not null,
  system_id uuid not null,
  usage_role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, step_id, system_id),
  foreign key (organization_id, step_id) references public.process_steps(organization_id, id) on delete cascade,
  foreign key (organization_id, system_id) references public.systems(organization_id, id) on delete cascade
);

create table public.data_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  system_id uuid,
  name text not null check (length(trim(name)) > 0),
  category text,
  description text,
  source_description text,
  data_format text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, system_id)
    references public.systems(organization_id, id) on delete set null (system_id)
);

create table public.process_step_data (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  step_id uuid not null,
  data_asset_id uuid not null,
  direction text not null check (direction in ('input', 'output')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, step_id, data_asset_id, direction),
  foreign key (organization_id, step_id) references public.process_steps(organization_id, id) on delete cascade,
  foreign key (organization_id, data_asset_id) references public.data_assets(organization_id, id) on delete cascade
);

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_step_id uuid,
  source_team_id uuid,
  destination_step_id uuid,
  destination_team_id uuid,
  information_transferred text not null check (length(trim(information_transferred)) > 0),
  handoff_method text,
  delay_minutes numeric(12,2) check (delay_minutes >= 0),
  failure_rate_percent numeric(5,2) check (failure_rate_percent between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(source_step_id, source_team_id) >= 1),
  check (num_nonnulls(destination_step_id, destination_team_id) >= 1),
  check (source_step_id is distinct from destination_step_id or source_step_id is null or destination_step_id is null),
  foreign key (organization_id, source_step_id)
    references public.process_steps(organization_id, id) on delete cascade,
  foreign key (organization_id, destination_step_id)
    references public.process_steps(organization_id, id) on delete cascade,
  foreign key (organization_id, source_team_id)
    references public.operational_teams(organization_id, id) on delete cascade,
  foreign key (organization_id, destination_team_id)
    references public.operational_teams(organization_id, id) on delete cascade
);

create table public.process_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upstream_process_id uuid not null,
  downstream_process_id uuid not null,
  condition_description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, upstream_process_id, downstream_process_id),
  check (upstream_process_id <> downstream_process_id),
  foreign key (organization_id, upstream_process_id) references public.processes(organization_id, id) on delete cascade,
  foreign key (organization_id, downstream_process_id) references public.processes(organization_id, id) on delete cascade
);

create table public.step_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upstream_step_id uuid not null,
  downstream_step_id uuid not null,
  condition_description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, upstream_step_id, downstream_step_id),
  check (upstream_step_id <> downstream_step_id),
  foreign key (organization_id, upstream_step_id) references public.process_steps(organization_id, id) on delete cascade,
  foreign key (organization_id, downstream_step_id) references public.process_steps(organization_id, id) on delete cascade
);

create table public.process_constraints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid,
  step_id uuid,
  system_id uuid,
  issue_description text not null check (length(trim(issue_description)) > 0),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  frequency text not null default 'occasional' check (frequency in ('rare', 'occasional', 'frequent', 'continuous')),
  status text not null default 'open' check (status in ('open', 'investigating', 'planned', 'resolved')),
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (num_nonnulls(process_id, step_id, system_id) >= 1),
  foreign key (organization_id, process_id)
    references public.processes(organization_id, id) on delete restrict,
  foreign key (organization_id, step_id)
    references public.process_steps(organization_id, id) on delete restrict,
  foreign key (organization_id, process_id, step_id)
    references public.process_steps(organization_id, process_id, id),
  foreign key (organization_id, system_id)
    references public.systems(organization_id, id) on delete restrict
);

-- Root cause, consequence, and opportunity linkage stay out of the client-readable row.
create table public.constraint_diagnostics (
  constraint_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  root_cause text,
  business_consequence text,
  opportunity_id uuid,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, constraint_id) references public.process_constraints(organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id)
    references public.opportunities(organization_id, id) on delete set null (opportunity_id)
);

create table public.process_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid not null,
  step_id uuid,
  name text not null check (length(trim(name)) > 0),
  definition text,
  unit text not null check (length(trim(unit)) > 0),
  desired_direction text not null default 'decrease'
    check (desired_direction in ('increase', 'decrease', 'maintain')),
  baseline_value numeric(18,4),
  target_value numeric(18,4),
  actual_value numeric(18,4),
  actual_measured_at timestamptz,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, process_id) references public.processes(organization_id, id) on delete cascade,
  foreign key (organization_id, process_id, step_id)
    references public.process_steps(organization_id, process_id, id) on delete set null (step_id)
);

-- FK and tenant-filter indexes (the organization_id,id unique constraints cover each table's primary lookup).
create index operational_teams_owner_idx on public.operational_teams (organization_id, owner_membership_id);
create index operational_team_members_membership_idx on public.operational_team_members (organization_id, membership_id);
create index processes_area_order_idx on public.processes (organization_id, operational_area_id, sort_order);
create index processes_owner_membership_idx on public.processes (organization_id, owner_membership_id);
create index processes_owner_team_idx on public.processes (organization_id, owner_team_id);
create index process_steps_process_order_idx on public.process_steps (organization_id, process_id, sort_order);
create index process_steps_owner_membership_idx on public.process_steps (organization_id, owner_membership_id);
create index process_steps_owner_team_idx on public.process_steps (organization_id, owner_team_id);
create index process_systems_system_idx on public.process_systems (organization_id, system_id);
create index process_step_systems_system_idx on public.process_step_systems (organization_id, system_id);
create index data_assets_system_idx on public.data_assets (organization_id, system_id);
create index process_step_data_asset_idx on public.process_step_data (organization_id, data_asset_id);
create index handoffs_source_step_idx on public.handoffs (organization_id, source_step_id);
create index handoffs_destination_step_idx on public.handoffs (organization_id, destination_step_id);
create index handoffs_source_team_idx on public.handoffs (organization_id, source_team_id);
create index handoffs_destination_team_idx on public.handoffs (organization_id, destination_team_id);
create index process_dependencies_downstream_idx on public.process_dependencies (organization_id, downstream_process_id);
create index step_dependencies_downstream_idx on public.step_dependencies (organization_id, downstream_step_id);
create index process_constraints_process_idx on public.process_constraints (organization_id, process_id);
create index process_constraints_step_idx on public.process_constraints (organization_id, step_id);
create index process_constraints_system_idx on public.process_constraints (organization_id, system_id);
create index constraint_diagnostics_opportunity_idx on public.constraint_diagnostics (organization_id, opportunity_id);
create index process_metrics_process_idx on public.process_metrics (organization_id, process_id);
create index process_metrics_step_idx on public.process_metrics (organization_id, step_id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'operational_teams', 'processes', 'process_steps', 'systems',
    'process_systems', 'process_step_systems', 'data_assets', 'process_step_data',
    'handoffs', 'process_dependencies', 'step_dependencies',
    'process_constraints', 'constraint_diagnostics', 'process_metrics'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_updated_at', table_name);
  end loop;
end $$;

-- Authoring the operating model is Delaro-only, including existing operational areas.
drop policy "Admins can manage operational areas" on public.operational_areas;
create policy "Delaro users manage operational areas" on public.operational_areas for all to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'operational_teams', 'operational_team_members', 'processes', 'process_steps',
    'systems', 'process_systems', 'process_step_systems', 'data_assets',
    'process_step_data', 'handoffs', 'process_dependencies', 'step_dependencies',
    'process_constraints', 'constraint_diagnostics', 'process_metrics'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[]))',
      'Delaro users manage ' || table_name, table_name);
  end loop;
end $$;

-- Published rows are readable by any active member of the same organization.
create policy "Members view published teams" on public.operational_teams for select to authenticated
  using (client_visible and public.is_org_member(organization_id));
create policy "Members view published processes" on public.processes for select to authenticated
  using (client_visible and public.is_org_member(organization_id));
create policy "Members view published steps" on public.process_steps for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.processes p where p.organization_id = process_steps.organization_id
      and p.id = process_steps.process_id and p.client_visible));
create policy "Members view published systems" on public.systems for select to authenticated
  using (client_visible and public.is_org_member(organization_id));
create policy "Members view published data assets" on public.data_assets for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and (system_id is null or exists (select 1 from public.systems s
      where s.organization_id = data_assets.organization_id and s.id = data_assets.system_id and s.client_visible)));
create policy "Members view published constraints" on public.process_constraints for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and (process_id is null or exists (select 1 from public.processes p
      where p.organization_id = process_constraints.organization_id and p.id = process_constraints.process_id and p.client_visible))
    and (step_id is null or exists (select 1 from public.process_steps s
      where s.organization_id = process_constraints.organization_id and s.id = process_constraints.step_id and s.client_visible))
    and (system_id is null or exists (select 1 from public.systems s
      where s.organization_id = process_constraints.organization_id and s.id = process_constraints.system_id and s.client_visible)));
create policy "Members view published metrics" on public.process_metrics for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.processes p
      where p.organization_id = process_metrics.organization_id and p.id = process_metrics.process_id and p.client_visible)
    and (step_id is null or exists (select 1 from public.process_steps s
      where s.organization_id = process_metrics.organization_id and s.id = process_metrics.step_id and s.client_visible)));
