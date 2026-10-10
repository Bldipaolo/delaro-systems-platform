-- Explicitly approved client narrative for an internal initiative.
create table public.initiative_client_narratives (
  initiative_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  current_state_summary text,
  intervention_summary text,
  implementation_summary text,
  expected_result_summary text,
  measurement_plan_summary text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, initiative_id)
    references public.initiatives(organization_id, id) on delete cascade
);
create trigger initiative_client_narratives_updated_at before update on public.initiative_client_narratives
  for each row execute function public.set_updated_at();
alter table public.initiative_client_narratives enable row level security;
revoke all on public.initiative_client_narratives from anon;
grant select, insert, update, delete on public.initiative_client_narratives to authenticated;
create policy "Delaro users manage improvement narratives" on public.initiative_client_narratives
  for all to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members view published improvement narratives" on public.initiative_client_narratives
  for select to authenticated
  using (client_visible and public.is_org_member(organization_id));
