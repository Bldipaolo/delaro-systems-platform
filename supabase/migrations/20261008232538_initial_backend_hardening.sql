-- This project began empty. Keep older migration bodies immutable and harden
-- client publication, tenant references, and approval transitions here.

-- Auth users need a profile before an administrator can assign a membership.
create function private.sync_auth_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null then
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do update set email = excluded.email;
  end if;
  return new;
end $$;
revoke all on function private.sync_auth_profile() from public, anon, authenticated;
create trigger auth_user_profile_sync after insert or update of email on auth.users
  for each row execute function private.sync_auth_profile();
insert into public.profiles (id, email)
  select id, email from auth.users where email is not null
  on conflict (id) do update set email = excluded.email;

-- RLS protects rows, not columns. A published value model must not carry
-- internal notes on a row that clients can select through the Data API.
create table public.value_model_internal_details (
  model_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, model_id)
    references public.value_models(organization_id, id) on delete cascade
);
insert into public.value_model_internal_details (model_id, organization_id, notes_internal)
  select id, organization_id, notes_internal from public.value_models
  where notes_internal is not null;
alter table public.value_models drop column notes_internal;
create trigger value_model_internal_details_updated_at before update on public.value_model_internal_details
  for each row execute function public.set_updated_at();
alter table public.value_model_internal_details enable row level security;
revoke all on public.value_model_internal_details from anon, authenticated;
grant select, insert, update, delete on public.value_model_internal_details to authenticated;
create policy "Delaro manages private value details" on public.value_model_internal_details
  for all to authenticated
  using (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id, array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

-- Legacy metrics can hold an actual number without measurement evidence.
-- Leave that internal until the verified measurement tables become its source.
update public.process_metrics set client_visible = false
  where client_visible and (actual_value is not null or actual_measured_at is not null);
alter table public.process_metrics add constraint published_process_metrics_have_no_unverified_actual
  check (not client_visible or (actual_value is null and actual_measured_at is null));

-- Existing ID-only foreign keys did not prohibit a row from linking to a
-- record in another organization. Composite keys enforce the tenant boundary.
alter table public.opportunity_client_summaries add constraint opportunity_client_summaries_tenant_fk
  foreign key (organization_id, opportunity_id) references public.opportunities(organization_id, id) on delete cascade;
alter table public.opportunity_score_snapshots add constraint opportunity_score_snapshots_tenant_fk
  foreign key (organization_id, opportunity_id) references public.opportunities(organization_id, id) on delete cascade;
alter table public.initiatives add constraint initiatives_opportunity_tenant_fk
  foreign key (organization_id, opportunity_id) references public.opportunities(organization_id, id)
  on delete set null (opportunity_id);
alter table public.initiative_internal_details add constraint initiative_internal_details_tenant_fk
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete cascade;
alter table public.initiative_milestones add constraint initiative_milestones_tenant_fk
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete cascade;
alter table public.opportunities add constraint opportunities_owner_tenant_fk
  foreign key (organization_id, owner_id) references public.organization_memberships(organization_id, user_id)
  on delete set null (owner_id);
alter table public.initiatives add constraint initiatives_owner_tenant_fk
  foreign key (organization_id, owner_id) references public.organization_memberships(organization_id, user_id)
  on delete set null (owner_id);
alter table public.initiative_milestones add constraint initiative_milestones_owner_tenant_fk
  foreign key (organization_id, owner_id) references public.organization_memberships(organization_id, user_id)
  on delete set null (owner_id);

-- Human approval must not be bypassed by relabeling the decision in the
-- same write that sets status to approved.
alter table public.decisions add constraint approved_decisions_require_approval_kind
  check (status <> 'approved' or kind = 'approval');
create function private.keep_decision_kind() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'Decision kind cannot be changed after creation';
  end if;
  return new;
end $$;
revoke all on function private.keep_decision_kind() from public, anon, authenticated;
create trigger decisions_keep_kind before update on public.decisions
  for each row execute function private.keep_decision_kind();

-- Foundational SELECT privileges are explicit; RLS still limits rows.
revoke all on public.profiles, public.organizations from anon;
grant select on public.profiles, public.organizations to authenticated;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.has_org_role(uuid, public.organization_member_role[]) from anon;
