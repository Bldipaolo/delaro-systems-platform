-- Client-approved operational detail. Internal diagnostics remain in constraint_diagnostics.
-- Existing tables were created under Supabase defaults; make these read grants explicit.
grant select on public.organization_memberships, public.operational_areas,
  public.opportunity_client_summaries, public.initiatives to authenticated;
alter table public.opportunity_client_summaries
  add constraint opportunity_client_summaries_org_id_id_key unique (organization_id, id);
alter table public.initiatives
  add constraint initiatives_org_id_id_key unique (organization_id, id);

alter table public.process_systems add column client_visible boolean not null default false;
alter table public.process_step_systems add column client_visible boolean not null default false;
alter table public.process_step_data add column client_visible boolean not null default false;
alter table public.handoffs add column client_visible boolean not null default false;
alter table public.process_dependencies add column client_visible boolean not null default false;
alter table public.step_dependencies add column client_visible boolean not null default false;

create table public.constraint_publications (
  constraint_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  root_cause_summary text,
  business_consequence_summary text,
  measured_delay_minutes numeric(12,2) check (measured_delay_minutes >= 0),
  opportunity_summary_id uuid,
  initiative_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, constraint_id)
    references public.process_constraints(organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_summary_id)
    references public.opportunity_client_summaries(organization_id, id) on delete set null (opportunity_summary_id),
  foreign key (organization_id, initiative_id)
    references public.initiatives(organization_id, id) on delete set null (initiative_id)
);
create index constraint_publications_opportunity_idx on public.constraint_publications (organization_id, opportunity_summary_id);
create index constraint_publications_initiative_idx on public.constraint_publications (organization_id, initiative_id);
create trigger constraint_publications_updated_at before update on public.constraint_publications
  for each row execute function public.set_updated_at();

-- A reviewed display identity for process ownership; no profile email or private details.
create table public.operational_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  display_name text not null check (length(trim(display_name)) > 0),
  title text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, membership_id),
  foreign key (organization_id, membership_id)
    references public.organization_memberships(organization_id, id) on delete cascade
);
create trigger operational_people_updated_at before update on public.operational_people
  for each row execute function public.set_updated_at();
alter table public.operational_people enable row level security;
revoke all on public.operational_people from anon;
grant select, insert, update, delete on public.operational_people to authenticated;
create policy "Delaro users manage operational people" on public.operational_people
  for all to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members view published operational people" on public.operational_people
  for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.organization_memberships m
      where m.organization_id = operational_people.organization_id
        and m.id = operational_people.membership_id and m.status = 'active'));

alter table public.constraint_publications enable row level security;
revoke all on public.constraint_publications from anon;
grant select, insert, update, delete on public.constraint_publications to authenticated;

create policy "Delaro users manage constraint publications" on public.constraint_publications
  for all to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members view published constraint details" on public.constraint_publications
  for select to authenticated
  using (public.is_org_member(organization_id)
    and exists (select 1 from public.process_constraints c
      where c.organization_id = constraint_publications.organization_id
        and c.id = constraint_publications.constraint_id and c.client_visible));

-- Every relationship is separately reviewed for publication. Both endpoints must be visible.
create policy "Members view published process systems" on public.process_systems for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.processes p where p.organization_id = process_systems.organization_id
      and p.id = process_systems.process_id and p.client_visible)
    and exists (select 1 from public.systems s where s.organization_id = process_systems.organization_id
      and s.id = process_systems.system_id and s.client_visible));
create policy "Members view published step systems" on public.process_step_systems for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.process_steps s where s.organization_id = process_step_systems.organization_id
      and s.id = process_step_systems.step_id and s.client_visible)
    and exists (select 1 from public.systems t where t.organization_id = process_step_systems.organization_id
      and t.id = process_step_systems.system_id and t.client_visible));
create policy "Members view published step data" on public.process_step_data for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.process_steps s where s.organization_id = process_step_data.organization_id
      and s.id = process_step_data.step_id and s.client_visible)
    and exists (select 1 from public.data_assets a where a.organization_id = process_step_data.organization_id
      and a.id = process_step_data.data_asset_id and a.client_visible));
create policy "Members view published handoffs" on public.handoffs for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and (source_step_id is null or exists (select 1 from public.process_steps s
      where s.organization_id = handoffs.organization_id and s.id = handoffs.source_step_id and s.client_visible))
    and (destination_step_id is null or exists (select 1 from public.process_steps s
      where s.organization_id = handoffs.organization_id and s.id = handoffs.destination_step_id and s.client_visible))
    and (source_team_id is null or exists (select 1 from public.operational_teams t
      where t.organization_id = handoffs.organization_id and t.id = handoffs.source_team_id and t.client_visible))
    and (destination_team_id is null or exists (select 1 from public.operational_teams t
      where t.organization_id = handoffs.organization_id and t.id = handoffs.destination_team_id and t.client_visible)));
create policy "Members view published process dependencies" on public.process_dependencies for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.processes p where p.organization_id = process_dependencies.organization_id
      and p.id = process_dependencies.upstream_process_id and p.client_visible)
    and exists (select 1 from public.processes p where p.organization_id = process_dependencies.organization_id
      and p.id = process_dependencies.downstream_process_id and p.client_visible));
create policy "Members view published step dependencies" on public.step_dependencies for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and exists (select 1 from public.process_steps s where s.organization_id = step_dependencies.organization_id
      and s.id = step_dependencies.upstream_step_id and s.client_visible)
    and exists (select 1 from public.process_steps s where s.organization_id = step_dependencies.organization_id
      and s.id = step_dependencies.downstream_step_id and s.client_visible));
