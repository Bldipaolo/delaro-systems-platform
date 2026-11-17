-- Direct operational scope for improvements. Composite keys prevent cross-tenant links.
create table public.initiative_processes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid not null,
  process_id uuid not null,
  relationship text,
  created_at timestamptz not null default now(),
  primary key (organization_id, initiative_id, process_id),
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete cascade,
  foreign key (organization_id, process_id) references public.processes(organization_id, id) on delete restrict
);

create table public.initiative_systems (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid not null,
  system_id uuid not null,
  relationship text,
  created_at timestamptz not null default now(),
  primary key (organization_id, initiative_id, system_id),
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete cascade,
  foreign key (organization_id, system_id) references public.systems(organization_id, id) on delete restrict
);

create index initiative_processes_process_idx on public.initiative_processes (organization_id, process_id);
create index initiative_systems_system_idx on public.initiative_systems (organization_id, system_id);

alter table public.initiative_processes enable row level security;
alter table public.initiative_systems enable row level security;
revoke all on public.initiative_processes, public.initiative_systems from anon;
grant select, insert, update, delete on public.initiative_processes, public.initiative_systems to authenticated;

create policy "Internal users manage initiative processes" on public.initiative_processes
  for all to authenticated
  using (private.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Internal users manage initiative systems" on public.initiative_systems
  for all to authenticated
  using (private.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
