-- Stage 4B extends the existing value model without duplicating Stage 4A measurement.
-- Estimates, observed economic consequences, realized outcomes, and verified value
-- remain separate claims with separate evidence requirements.

alter table public.value_models
  add column economic_mechanism text,
  add column time_horizon text not null default 'annual'
    check (time_horizon in ('weekly','monthly','quarterly','annual','custom')),
  add column model_period_start date,
  add column model_period_end date,
  add column attribution_percentage numeric(5,2)
    check (attribution_percentage between 0 and 100),
  add column attribution_rationale text,
  add constraint value_models_period_check
    check (model_period_end is null or (model_period_start is not null and model_period_end >= model_period_start)),
  add constraint value_models_attribution_check
    check ((attribution_percentage is null) = (attribution_rationale is null));

alter table public.value_model_inputs
  alter column value drop not null,
  add column metric_id uuid,
  add column derivation text not null default 'manual'
    check (derivation in ('manual','metric_baseline','metric_latest_verified','metric_latest_observed','metric_improvement_absolute','metric_improvement_percentage')),
  add column measurement_period_start date,
  add column measurement_period_end date,
  add column stale_after_days integer check (stale_after_days between 1 and 3650),
  add column sensitivity_low numeric(18,6),
  add column sensitivity_high numeric(18,6),
  add column input_status text not null default 'current'
    check (input_status in ('current','stale','invalid','pending')),
  add constraint value_model_inputs_metric_fk
    foreign key (organization_id, metric_id)
    references public.measurement_metrics(organization_id, id) on delete restrict,
  add constraint value_model_inputs_source_check check (
    (derivation = 'manual' and value is not null and metric_id is null)
    or (derivation <> 'manual' and value is null and metric_id is not null)
  ),
  add constraint value_model_inputs_period_check
    check (measurement_period_end is null or (measurement_period_start is not null and measurement_period_end >= measurement_period_start)),
  add constraint value_model_inputs_sensitivity_check check (
    (sensitivity_low is null or sensitivity_low >= 0)
    and (sensitivity_high is null or sensitivity_high >= 0)
    and (sensitivity_low is null or sensitivity_high is null or sensitivity_low <= sensitivity_high)
  );

create index value_model_inputs_metric_idx
  on public.value_model_inputs (organization_id, metric_id)
  where metric_id is not null;

alter table public.value_realization_snapshots
  add column realization_state text not null default 'realized'
    check (realization_state in ('observed','realized')),
  add column client_visible boolean not null default false,
  add column source_description text,
  add constraint value_realization_state_check check (
    realization_state <> 'realized' or evidence_id is not null
  );

create table public.value_model_metric_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  metric_id uuid not null,
  relationship text not null check (relationship in ('driver','volume','quality','attribution','cost')),
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, model_id, metric_id, relationship),
  foreign key (organization_id, model_id)
    references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, metric_id)
    references public.measurement_metrics(organization_id, id) on delete restrict
);

create table public.value_model_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  workflow_id uuid not null,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, model_id, workflow_id),
  foreign key (organization_id, model_id)
    references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, workflow_id)
    references public.implementation_workflows(organization_id, id) on delete cascade
);

create table public.value_model_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  category text not null check (category in ('implementation','software','api','infrastructure','maintenance','delaro_fee','client_labor','other')),
  label text not null check (length(trim(label)) > 0),
  amount numeric(18,2) not null check (amount >= 0),
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  cadence text not null check (cadence in ('one_time','monthly','quarterly','annual','custom')),
  annualization_factor numeric(10,4) check (annualization_factor > 0 and annualization_factor <= 366),
  period_start date,
  period_end date,
  source_description text not null check (length(trim(source_description)) > 0),
  evidence_id uuid,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','submitted','verified','rejected')),
  verified_by_membership_id uuid,
  verified_at timestamptz,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, model_id, id),
  check ((cadence = 'custom') = (annualization_factor is not null)),
  check (period_end is null or (period_start is not null and period_end >= period_start)),
  check (verification_status <> 'verified' or (verified_by_membership_id is not null and verified_at is not null)),
  foreign key (organization_id, model_id)
    references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, model_id, evidence_id)
    references public.value_evidence(organization_id, model_id, id) on delete restrict,
  foreign key (organization_id, verified_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.value_model_validations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  requested_from_membership_id uuid not null,
  requested_by_membership_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','disputed')),
  request_note text,
  response_note text,
  responded_by_membership_id uuid,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'pending' or (responded_by_membership_id is not null and responded_at is not null)),
  foreign key (organization_id, model_id)
    references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, requested_from_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, requested_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, responded_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create index value_model_metric_links_model_idx on public.value_model_metric_links (organization_id, model_id);
create index value_model_workflows_workflow_idx on public.value_model_workflows (organization_id, workflow_id);
create index value_model_costs_model_idx on public.value_model_costs (organization_id, model_id);
create index value_model_validations_assignee_idx on public.value_model_validations (organization_id, requested_from_membership_id, status);

create trigger value_model_costs_updated_at before update on public.value_model_costs
  for each row execute function public.set_updated_at();
create trigger value_model_validations_updated_at before update on public.value_model_validations
  for each row execute function public.set_updated_at();

-- Publishing a derived input is allowed only when the linked metric is also client-safe.
create or replace function public.guard_value_model_publication() returns trigger language plpgsql
set search_path = '' as $$
declare factor_count integer; baseline_count integer; target_count integer;
begin
  if new.client_visible and new.status = 'active' then
    select count(*) filter (where role = 'factor'), count(*) filter (where role = 'baseline'),
      count(*) filter (where role = 'target')
    into factor_count, baseline_count, target_count
    from public.value_model_inputs where organization_id = new.organization_id and model_id = new.id;
    if (new.formula_kind = 'product' and (factor_count < 2 or baseline_count <> 0 or target_count <> 0))
      or (new.formula_kind <> 'product' and (factor_count < 1 or baseline_count <> 1 or target_count <> 1))
      or exists (
        select 1 from public.value_model_inputs i
        where i.organization_id = new.organization_id and i.model_id = new.id
          and (
            not i.client_visible
            or (i.evidence_id is not null and not exists (
              select 1 from public.value_evidence e
              where e.organization_id = i.organization_id and e.model_id = i.model_id
                and e.id = i.evidence_id and e.client_visible
            ))
            or (i.metric_id is not null and not exists (
              select 1 from public.measurement_metrics mm
              where mm.organization_id = i.organization_id and mm.id = i.metric_id and mm.client_visible
            ))
          )
      ) then
      raise exception 'Publish only complete models with client-visible inputs and linked evidence';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_value_model_publication() from public, anon, authenticated;

create or replace function private.guard_value_validation_response() returns trigger
language plpgsql set search_path = '' as $$
declare responder_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then raise exception 'A completed validation response is immutable'; end if;
    if new.organization_id <> old.organization_id or new.model_id <> old.model_id
      or new.requested_from_membership_id <> old.requested_from_membership_id
      or new.requested_by_membership_id <> old.requested_by_membership_id then
      raise exception 'Validation assignment cannot be changed';
    end if;
    if new.status not in ('approved','disputed') then raise exception 'Choose approve or dispute'; end if;
    select id into responder_id from public.organization_memberships
      where organization_id = old.organization_id and user_id = (select auth.uid())
        and id = old.requested_from_membership_id and status = 'active';
    if responder_id is null then raise exception 'Only the assigned active client member may respond'; end if;
    new.responded_by_membership_id := responder_id;
    new.responded_at := now();
  end if;
  return new;
end $$;
revoke all on function private.guard_value_validation_response() from public, anon, authenticated;
create trigger guard_value_validation_response before update on public.value_model_validations
  for each row execute function private.guard_value_validation_response();

create or replace function private.guard_verified_value_cost() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.verification_status = 'verified' then
    raise exception 'Verified value costs are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.verification_status = 'verified' and (
    new.evidence_id is null or not exists (
      select 1 from public.value_evidence e
      where e.organization_id = new.organization_id and e.model_id = new.model_id
        and e.id = new.evidence_id and e.verification_status = 'verified'
    )
  ) then raise exception 'Verified costs require verified evidence'; end if;
  return new;
end $$;
revoke all on function private.guard_verified_value_cost() from public, anon, authenticated;
create trigger guard_verified_value_cost before insert or update or delete on public.value_model_costs
  for each row execute function private.guard_verified_value_cost();

do $$ declare table_name text;
begin
  foreach table_name in array array['value_model_metric_links','value_model_workflows','value_model_costs','value_model_validations'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[]))',
      'Delaro users manage ' || table_name, table_name
    );
  end loop;
end $$;

create policy "Members view published value metric links" on public.value_model_metric_links
for select to authenticated using (
  client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_model_metric_links.organization_id
      and m.id = value_model_metric_links.model_id and m.client_visible and m.status = 'active'
  )
);
create policy "Members view published value workflow links" on public.value_model_workflows
for select to authenticated using (
  client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_model_workflows.organization_id
      and m.id = value_model_workflows.model_id and m.client_visible and m.status = 'active'
  )
);
create policy "Members view published value costs" on public.value_model_costs
for select to authenticated using (
  client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_model_costs.organization_id
      and m.id = value_model_costs.model_id and m.client_visible and m.status = 'active'
  )
);
create policy "Assigned members view value validations" on public.value_model_validations
for select to authenticated using (
  public.is_org_member(organization_id) and exists (
    select 1 from public.organization_memberships om
    where om.organization_id = value_model_validations.organization_id
      and om.id = value_model_validations.requested_from_membership_id
      and om.user_id = (select auth.uid()) and om.status = 'active'
  )
);
create policy "Assigned members respond to value validations" on public.value_model_validations
for update to authenticated using (
  status = 'pending' and exists (
    select 1 from public.organization_memberships om
    where om.organization_id = value_model_validations.organization_id
      and om.id = value_model_validations.requested_from_membership_id
      and om.user_id = (select auth.uid()) and om.status = 'active'
  )
) with check (
  status in ('approved','disputed') and exists (
    select 1 from public.organization_memberships om
    where om.organization_id = value_model_validations.organization_id
      and om.id = value_model_validations.requested_from_membership_id
      and om.user_id = (select auth.uid()) and om.status = 'active'
  )
);

-- Explicitly published observed/realized periods may be shown to clients, but they
-- still do not enter verified totals until both evidence and the period are verified.
create policy "Members view published observed value" on public.value_realization_snapshots
for select to authenticated using (
  client_visible and verification_status in ('pending','submitted')
  and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_realization_snapshots.organization_id
      and m.id = value_realization_snapshots.model_id and m.client_visible and m.status = 'active'
  ) and exists (
    select 1 from public.value_evidence e where e.organization_id = value_realization_snapshots.organization_id
      and e.model_id = value_realization_snapshots.model_id and e.id = value_realization_snapshots.evidence_id
      and e.client_visible
  )
);
