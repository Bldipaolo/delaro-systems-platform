-- Measurement is evidence-led: current results are derived from verified observations.
create table public.measurement_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid,
  process_id uuid,
  process_step_id uuid,
  name text not null check (length(trim(name)) > 0),
  description text,
  unit text not null check (length(trim(unit)) > 0),
  improvement_direction text not null check (improvement_direction in ('increase','decrease','target')),
  source_system_id uuid,
  measurement_method text,
  cadence text,
  owner_membership_id uuid,
  confidence_status text not null default 'pending' check (confidence_status in ('pending','limited','supported','verified')),
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (num_nonnulls(initiative_id, process_id) >= 1),
  check (process_step_id is null or process_id is not null),
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete cascade,
  foreign key (organization_id, process_id) references public.processes(organization_id, id) on delete cascade,
  foreign key (organization_id, process_id, process_step_id)
    references public.process_steps(organization_id, process_id, id) on delete set null (process_step_id),
  foreign key (organization_id, source_system_id)
    references public.systems(organization_id, id) on delete set null (source_system_id),
  foreign key (organization_id, owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (owner_membership_id)
);

create table public.measurement_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null,
  source_type text not null check (source_type in ('system_export','document','manual_record','audit','other')),
  source_reference text,
  document_url text,
  description text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','submitted','verified','rejected')),
  verified_by_membership_id uuid,
  verified_at timestamptz,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, metric_id, id),
  check (verification_status <> 'verified' or (verified_by_membership_id is not null and verified_at is not null)),
  foreign key (organization_id, metric_id) references public.measurement_metrics(organization_id, id) on delete cascade,
  foreign key (organization_id, verified_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (verified_by_membership_id)
);

create table public.metric_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null,
  value numeric(18,4) not null,
  period_start date,
  period_end date,
  source_description text,
  evidence_id uuid,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','submitted','verified','rejected')),
  verified_by_membership_id uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, metric_id),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (verification_status <> 'verified' or (evidence_id is not null and verified_by_membership_id is not null and verified_at is not null)),
  foreign key (organization_id, metric_id) references public.measurement_metrics(organization_id, id) on delete cascade,
  foreign key (organization_id, metric_id, evidence_id)
    references public.measurement_evidence(organization_id, metric_id, id),
  foreign key (organization_id, verified_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (verified_by_membership_id)
);

create table public.metric_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null,
  value numeric(18,4) not null,
  target_date date,
  rationale text,
  set_by_membership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, metric_id),
  foreign key (organization_id, metric_id) references public.measurement_metrics(organization_id, id) on delete cascade,
  foreign key (organization_id, set_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (set_by_membership_id)
);

create table public.metric_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null,
  measured_value numeric(18,4) not null,
  measured_at timestamptz not null,
  period_start date,
  period_end date,
  source_description text,
  evidence_id uuid,
  entered_by_membership_id uuid,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','submitted','verified','rejected')),
  verified_by_membership_id uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (verification_status <> 'verified' or (evidence_id is not null and verified_by_membership_id is not null and verified_at is not null)),
  foreign key (organization_id, metric_id) references public.measurement_metrics(organization_id, id) on delete cascade,
  foreign key (organization_id, metric_id, evidence_id)
    references public.measurement_evidence(organization_id, metric_id, id),
  foreign key (organization_id, entered_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (entered_by_membership_id),
  foreign key (organization_id, verified_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete set null (verified_by_membership_id)
);

create index measurement_metrics_initiative_idx on public.measurement_metrics (organization_id, initiative_id);
create index measurement_metrics_process_idx on public.measurement_metrics (organization_id, process_id);
create index measurement_metrics_step_idx on public.measurement_metrics (organization_id, process_id, process_step_id);
create index measurement_metrics_system_idx on public.measurement_metrics (organization_id, source_system_id);
create index measurement_metrics_owner_idx on public.measurement_metrics (organization_id, owner_membership_id);
create index measurement_evidence_metric_idx on public.measurement_evidence (organization_id, metric_id);
create index measurement_evidence_verifier_idx on public.measurement_evidence (organization_id, verified_by_membership_id);
create index metric_baselines_evidence_idx on public.metric_baselines (organization_id, metric_id, evidence_id);
create index metric_targets_set_by_idx on public.metric_targets (organization_id, set_by_membership_id);
create index metric_observations_latest_idx on public.metric_observations (organization_id, metric_id, measured_at desc);
create index metric_observations_evidence_idx on public.metric_observations (organization_id, metric_id, evidence_id);
create index metric_observations_entered_by_idx on public.metric_observations (organization_id, entered_by_membership_id);
create index metric_observations_verified_by_idx on public.metric_observations (organization_id, verified_by_membership_id);

do $$ declare table_name text;
begin
  foreach table_name in array array['measurement_metrics','measurement_evidence','metric_baselines','metric_targets','metric_observations'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[]))', 'Delaro users manage ' || table_name, table_name);
  end loop;
end $$;

create policy "Members view published metrics" on public.measurement_metrics for select to authenticated
  using (client_visible and public.is_org_member(organization_id));
create policy "Members view verified metric evidence" on public.measurement_evidence for select to authenticated
  using (client_visible and verification_status = 'verified' and public.is_org_member(organization_id)
    and exists (select 1 from public.measurement_metrics m where m.organization_id = measurement_evidence.organization_id
      and m.id = measurement_evidence.metric_id and m.client_visible));
create policy "Members view verified baselines" on public.metric_baselines for select to authenticated
  using (verification_status = 'verified' and public.is_org_member(organization_id)
    and exists (select 1 from public.measurement_metrics m where m.organization_id = metric_baselines.organization_id
      and m.id = metric_baselines.metric_id and m.client_visible)
    and exists (select 1 from public.measurement_evidence e where e.organization_id = metric_baselines.organization_id
      and e.id = metric_baselines.evidence_id and e.metric_id = metric_baselines.metric_id
      and e.verification_status = 'verified' and e.client_visible));
create policy "Members view metric targets" on public.metric_targets for select to authenticated
  using (public.is_org_member(organization_id)
    and exists (select 1 from public.measurement_metrics m where m.organization_id = metric_targets.organization_id
      and m.id = metric_targets.metric_id and m.client_visible));
create policy "Members view verified observations" on public.metric_observations for select to authenticated
  using (verification_status = 'verified' and public.is_org_member(organization_id)
    and exists (select 1 from public.measurement_metrics m where m.organization_id = metric_observations.organization_id
      and m.id = metric_observations.metric_id and m.client_visible)
    and exists (select 1 from public.measurement_evidence e where e.organization_id = metric_observations.organization_id
      and e.id = metric_observations.evidence_id and e.metric_id = metric_observations.metric_id
      and e.verification_status = 'verified' and e.client_visible));
