-- Economic impact is calculated from named inputs. Verified realization is a separate,
-- dated observation, never copied from an estimate or an expected target.
create table public.value_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid,
  opportunity_id uuid,
  metric_id uuid,
  name text not null check (length(trim(name)) > 0),
  category text not null check (category in (
    'labor_savings','capacity_creation','revenue_recovery','conversion_improvement',
    'response_time_improvement','error_reduction','avoided_hiring',
    'working_capital_improvement','risk_reduction')),
  formula_kind text not null check (formula_kind in ('product','positive_delta_product','negative_delta_product')),
  calculation_method text not null check (length(trim(calculation_method)) > 0),
  annualization_basis text not null check (length(trim(annualization_basis)) > 0),
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  benefit_stream_key text not null check (length(trim(benefit_stream_key)) > 0),
  recoverable_percentage numeric(5,2) check (recoverable_percentage between 0 and 100),
  expected_capture_percentage numeric(5,2) check (expected_capture_percentage between 0 and 100),
  confidence text not null default 'pending' check (confidence in ('pending','low','moderate','high')),
  confidence_rationale text,
  client_visible boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  aggregation_approved_at timestamptz,
  aggregation_approved_by_membership_id uuid,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (num_nonnulls(initiative_id, opportunity_id) >= 1),
  check ((aggregation_approved_at is null) = (aggregation_approved_by_membership_id is null)),
  check (aggregation_approved_at is null or (client_visible and status = 'active')),
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete restrict,
  foreign key (organization_id, opportunity_id) references public.opportunities(organization_id, id) on delete restrict,
  foreign key (organization_id, metric_id) references public.measurement_metrics(organization_id, id) on delete set null (metric_id),
  foreign key (organization_id, aggregation_approved_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.value_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  source_type text not null check (source_type in ('system_export','document','sample','client_record','audit','other')),
  source_reference text not null check (length(trim(source_reference)) > 0),
  document_url text,
  description text,
  verification_status text not null default 'pending' check (verification_status in ('pending','submitted','verified','rejected')),
  verified_by_membership_id uuid,
  verified_at timestamptz,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, model_id, id),
  check (verification_status <> 'verified' or (verified_by_membership_id is not null and verified_at is not null)),
  foreign key (organization_id, model_id) references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, verified_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.value_model_inputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  input_key text not null check (input_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(trim(label)) > 0),
  role text not null check (role in ('factor','baseline','target')),
  value numeric(18,6) not null check (value >= 0),
  unit text not null check (length(trim(unit)) > 0),
  origin text not null check (origin in ('known','client_assumption','delaro_assumption')),
  source_description text not null check (length(trim(source_description)) > 0),
  evidence_id uuid,
  client_visible boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, model_id, input_key),
  foreign key (organization_id, model_id) references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, model_id, evidence_id)
    references public.value_evidence(organization_id, model_id, id) on delete restrict
);

create table public.value_realization_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null,
  period_start date not null,
  period_end date not null,
  measured_at timestamptz not null,
  realized_units numeric(18,6) not null check (realized_units >= 0),
  unit_value numeric(18,6) not null check (unit_value >= 0),
  unit_label text not null check (length(trim(unit_label)) > 0),
  realized_value numeric(18,2) generated always as (round(realized_units * unit_value, 2)) stored,
  annualization_factor numeric(10,4) check (annualization_factor > 0 and annualization_factor <= 366),
  annualized_run_rate numeric(18,2) generated always as
    (case when annualization_factor is null then null else round(realized_units * unit_value * annualization_factor, 2) end) stored,
  annualization_method text,
  evidence_id uuid,
  verification_status text not null default 'pending' check (verification_status in ('pending','submitted','verified','rejected')),
  verified_by_membership_id uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((annualization_factor is null) = (annualization_method is null)),
  check (verification_status <> 'verified' or (evidence_id is not null and verified_by_membership_id is not null and verified_at is not null)),
  foreign key (organization_id, model_id) references public.value_models(organization_id, id) on delete cascade,
  foreign key (organization_id, model_id, evidence_id)
    references public.value_evidence(organization_id, model_id, id) on delete restrict,
  foreign key (organization_id, verified_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create index value_models_initiative_idx on public.value_models (organization_id, initiative_id);
create unique index value_models_active_stream_idx on public.value_models (organization_id, benefit_stream_key) where status = 'active';
create index value_models_opportunity_idx on public.value_models (organization_id, opportunity_id);
create index value_models_metric_idx on public.value_models (organization_id, metric_id);
create index value_models_aggregation_approver_idx on public.value_models (organization_id, aggregation_approved_by_membership_id);
create index value_evidence_model_idx on public.value_evidence (organization_id, model_id);
create index value_evidence_verifier_idx on public.value_evidence (organization_id, verified_by_membership_id);
create index value_model_inputs_model_idx on public.value_model_inputs (organization_id, model_id, sort_order);
create index value_model_inputs_evidence_idx on public.value_model_inputs (organization_id, model_id, evidence_id);
create index value_realization_snapshots_model_idx on public.value_realization_snapshots (organization_id, model_id, period_end desc);
create index value_realization_snapshots_evidence_idx on public.value_realization_snapshots (organization_id, model_id, evidence_id);
create index value_realization_snapshots_verifier_idx on public.value_realization_snapshots (organization_id, verified_by_membership_id);

-- Publishing freezes a complete, client-readable input set. Changes require withdrawal and re-review.
create function public.guard_value_model_publication() returns trigger language plpgsql
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
      or exists (select 1 from public.value_model_inputs i where i.organization_id = new.organization_id
        and i.model_id = new.id and (not i.client_visible or (i.evidence_id is not null and not exists (
          select 1 from public.value_evidence e where e.organization_id = i.organization_id
            and e.model_id = i.model_id and e.id = i.evidence_id and e.client_visible)))) then
      raise exception 'Publish only complete models with client-visible inputs and linked evidence';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_value_model_publication() from public, anon, authenticated;
create trigger guard_value_model_publication before insert or update on public.value_models
  for each row execute function public.guard_value_model_publication();

create function public.guard_published_value_inputs() returns trigger language plpgsql
set search_path = '' as $$
declare target_organization_id uuid; target_model_id uuid;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id; target_model_id := old.model_id;
  else
    target_organization_id := new.organization_id; target_model_id := new.model_id;
  end if;
  if exists (select 1 from public.value_models m where m.organization_id = target_organization_id
    and m.id = target_model_id and m.client_visible and m.status = 'active') then
    raise exception 'Withdraw a published value model before changing its inputs';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_published_value_inputs() from public, anon, authenticated;
create trigger guard_published_value_inputs before insert or update or delete on public.value_model_inputs
  for each row execute function public.guard_published_value_inputs();

-- A verified value must be backed by verified evidence, and verified records are append-only.
create function public.guard_verified_value_record() returns trigger language plpgsql
set search_path = '' as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.verification_status = 'verified' then
      raise exception 'Verified value evidence and snapshots are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'value_realization_snapshots' then
    if new.verification_status = 'verified' and (new.period_end > current_date or new.measured_at > now()) then
      raise exception 'Verified realization cannot be dated in the future';
    end if;
    if new.verification_status = 'verified' and not exists (
      select 1 from public.value_evidence e where e.organization_id = new.organization_id
        and e.model_id = new.model_id and e.id = new.evidence_id
        and e.verification_status = 'verified' and e.client_visible
    ) then
      raise exception 'Verified realization requires verified client-visible evidence';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_verified_value_record() from public, anon, authenticated;
create trigger guard_value_evidence before update or delete on public.value_evidence
  for each row execute function public.guard_verified_value_record();
create trigger guard_value_realization before insert or update or delete on public.value_realization_snapshots
  for each row execute function public.guard_verified_value_record();

do $$ declare table_name text;
begin
  foreach table_name in array array['value_models','value_evidence','value_model_inputs','value_realization_snapshots'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[])) with check (public.has_org_role(organization_id, array[''delaro_admin'',''delaro_consultant'']::public.organization_member_role[]))', 'Delaro users manage ' || table_name, table_name);
  end loop;
end $$;

create policy "Members view published value models" on public.value_models for select to authenticated
  using (client_visible and status = 'active' and public.is_org_member(organization_id));
create policy "Members view published value inputs" on public.value_model_inputs for select to authenticated
  using (client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_model_inputs.organization_id
      and m.id = value_model_inputs.model_id and m.client_visible and m.status = 'active'));
create policy "Members view published value evidence" on public.value_evidence for select to authenticated
  using (client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_evidence.organization_id
      and m.id = value_evidence.model_id and m.client_visible and m.status = 'active'));
create policy "Members view verified realized value" on public.value_realization_snapshots for select to authenticated
  using (verification_status = 'verified' and public.is_org_member(organization_id) and exists (
    select 1 from public.value_models m where m.organization_id = value_realization_snapshots.organization_id
      and m.id = value_realization_snapshots.model_id and m.client_visible and m.status = 'active') and exists (
    select 1 from public.value_evidence e where e.organization_id = value_realization_snapshots.organization_id
      and e.model_id = value_realization_snapshots.model_id and e.id = value_realization_snapshots.evidence_id
      and e.verification_status = 'verified' and e.client_visible));
