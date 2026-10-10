create type public.opportunity_status as enum ('Investigate', 'Qualified', 'Prioritized', 'Proposed', 'Approved', 'Implementing', 'Measuring', 'Complete', 'Rejected');
create type public.opportunity_priority as enum ('Low', 'Medium', 'High', 'Critical');
create type public.evidence_quality as enum ('Low', 'Medium', 'High');
create type public.initiative_status as enum ('On track', 'At risk', 'Complete');
create type public.initiative_phase as enum ('Validation', 'Design', 'Build', 'Test', 'Deploy', 'Measure');
create type public.risk_level as enum ('Low', 'Medium', 'High', 'Critical');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  department_or_process text not null,
  current_state_problem text not null,
  root_cause text,
  business_consequence text not null,
  estimated_annual_value numeric(14,2),
  estimated_implementation_cost numeric(14,2),
  financial_impact_score smallint not null check (financial_impact_score between 0 and 5),
  frequency_score smallint not null check (frequency_score between 0 and 5),
  addressability_score smallint not null check (addressability_score between 0 and 5),
  measurement_quality_score smallint not null check (measurement_quality_score between 0 and 5),
  strategic_leverage_score smallint not null check (strategic_leverage_score between 0 and 5),
  implementation_difficulty_score smallint not null check (implementation_difficulty_score between 0 and 5),
  organizational_complexity_score smallint not null check (organizational_complexity_score between 0 and 5),
  risk_score smallint not null check (risk_score between 0 and 5),
  opportunity_score integer not null,
  evidence_quality public.evidence_quality not null default 'Low',
  priority public.opportunity_priority not null default 'Low',
  status public.opportunity_status not null default 'Investigate',
  owner_id uuid references public.profiles(id) on delete set null,
  next_action text,
  opportunity_type text,
  source_artifact_id uuid,
  date_identified date not null default current_date,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunity_client_summaries (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  summary text not null,
  priority public.opportunity_priority not null,
  status public.opportunity_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunity_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  score integer not null,
  score_version text not null default 'v1',
  inputs jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.initiatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  title text not null,
  objective text not null,
  scope text,
  status public.initiative_status not null default 'On track',
  owner_id uuid references public.profiles(id) on delete set null,
  start_date date,
  target_launch_date date,
  actual_launch_date date,
  progress smallint not null default 0 check (progress between 0 and 100),
  current_phase public.initiative_phase not null default 'Validation',
  next_milestone text,
  client_visible_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.initiative_internal_details (
  initiative_id uuid primary key references public.initiatives(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_level public.risk_level not null default 'Low',
  blockers text,
  architecture_summary text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.initiative_milestones (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'Upcoming' check (status in ('Upcoming', 'In progress', 'Complete', 'Blocked')),
  due_date date,
  completed_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger opportunities_updated_at before update on public.opportunities for each row execute procedure public.set_updated_at();
create trigger opportunity_summaries_updated_at before update on public.opportunity_client_summaries for each row execute procedure public.set_updated_at();
create trigger initiatives_updated_at before update on public.initiatives for each row execute procedure public.set_updated_at();
create trigger initiative_internal_updated_at before update on public.initiative_internal_details for each row execute procedure public.set_updated_at();
create trigger milestones_updated_at before update on public.initiative_milestones for each row execute procedure public.set_updated_at();

alter table public.opportunities enable row level security;
alter table public.opportunity_client_summaries enable row level security;
alter table public.opportunity_score_snapshots enable row level security;
alter table public.initiatives enable row level security;
alter table public.initiative_internal_details enable row level security;
alter table public.initiative_milestones enable row level security;

revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.has_org_role(uuid, public.organization_member_role[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organization_member_role[]) to authenticated;

create policy "Internal users can view opportunities" on public.opportunities for select to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users can create opportunities" on public.opportunities for insert to authenticated with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users can update opportunities" on public.opportunities for update to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Members can view client opportunity summaries" on public.opportunity_client_summaries for select to authenticated using (public.is_org_member(organization_id));
create policy "Internal users can manage client opportunity summaries" on public.opportunity_client_summaries for all to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users can view score snapshots" on public.opportunity_score_snapshots for select to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users can create score snapshots" on public.opportunity_score_snapshots for insert to authenticated with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Members can view initiatives" on public.initiatives for select to authenticated using (public.is_org_member(organization_id));
create policy "Editors can create initiatives" on public.initiatives for insert to authenticated with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[]));
create policy "Editors can update initiatives" on public.initiatives for update to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[]));
create policy "Internal users can view initiative details" on public.initiative_internal_details for select to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users can manage initiative details" on public.initiative_internal_details for all to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members can view milestones" on public.initiative_milestones for select to authenticated using (public.is_org_member(organization_id));
create policy "Editors can manage milestones" on public.initiative_milestones for all to authenticated using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant','client_admin']::public.organization_member_role[]));
