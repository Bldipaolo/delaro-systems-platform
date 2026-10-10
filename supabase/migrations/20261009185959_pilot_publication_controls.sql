-- Make internal drafts an explicit publication boundary for the pilot.
alter table public.initiatives add column client_visible boolean not null default false;
alter table public.initiative_internal_details add column scope_internal text;
update public.initiative_internal_details d set scope_internal = i.scope
  from public.initiatives i where d.initiative_id = i.id and d.organization_id = i.organization_id;
insert into public.initiative_internal_details (initiative_id,organization_id,scope_internal)
  select i.id,i.organization_id,i.scope from public.initiatives i
  where i.scope is not null and not exists (
    select 1 from public.initiative_internal_details d where d.initiative_id=i.id and d.organization_id=i.organization_id);
alter table public.initiatives drop column scope;

drop policy "Members can view initiatives" on public.initiatives;
create policy "Members can view published initiatives" on public.initiatives for select to authenticated
  using (client_visible and public.is_org_member(organization_id));
create policy "Internal users can view initiative drafts" on public.initiatives for select to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
drop policy "Editors can create initiatives" on public.initiatives;
drop policy "Editors can update initiatives" on public.initiatives;
create policy "Internal users create initiatives" on public.initiatives for insert to authenticated
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users update initiatives" on public.initiatives for update to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

drop policy "Members can view milestones" on public.initiative_milestones;
create policy "Members can view published initiative milestones" on public.initiative_milestones for select to authenticated
  using (public.is_org_member(organization_id) and exists (
    select 1 from public.initiatives i where i.organization_id = initiative_milestones.organization_id
      and i.id = initiative_milestones.initiative_id and i.client_visible));
create policy "Internal users can view all milestones" on public.initiative_milestones for select to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
drop policy "Editors can manage milestones" on public.initiative_milestones;
create policy "Internal users manage milestones" on public.initiative_milestones for all to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

-- RLS protects rows, not free-text columns. These notes must stay in drafts;
-- publication requires a reviewed, client-safe row without internal notes.
alter table public.process_steps add constraint published_steps_have_no_private_notes
  check (not client_visible or notes is null);
alter table public.process_systems add constraint published_process_systems_have_no_private_notes
  check (not client_visible or notes is null);
alter table public.process_step_systems add constraint published_step_systems_have_no_private_notes
  check (not client_visible or notes is null);
alter table public.process_step_data add constraint published_step_data_have_no_private_notes
  check (not client_visible or notes is null);
alter table public.handoffs add constraint published_handoffs_have_no_private_notes
  check (not client_visible or notes is null);
alter table public.process_dependencies add constraint published_process_dependencies_have_no_private_notes
  check (not client_visible or notes is null);
alter table public.step_dependencies add constraint published_step_dependencies_have_no_private_notes
  check (not client_visible or notes is null);
