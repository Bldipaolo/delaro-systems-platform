-- Stage 5A: deterministic operational intelligence.
-- Rules and evaluation diagnostics remain internal. The signal row and its
-- lifecycle events contain only client-safe, explainable values.

create table public.operational_signal_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 180),
  signal_type text not null check (signal_type in (
    'workflow_failure_rate','workflow_repeated_failures','workflow_duration',
    'workflow_throughput','metric_deterioration','metric_improvement',
    'metric_volume','metric_target_breach','metric_baseline_deviation',
    'source_stale','source_degraded','source_sync_failures',
    'economic_value_deterioration','economic_input_stale'
  )),
  entity_type text not null check (entity_type in ('metric','workflow','measurement_source')),
  metric_id uuid,
  workflow_id uuid,
  measurement_source_id uuid,
  related_entity_id uuid generated always as (coalesce(metric_id,workflow_id,measurement_source_id)) stored,
  detection_method text not null check (detection_method in (
    'percentage_deviation','rolling_median','consecutive_deterioration',
    'threshold_breach','failure_rate','consecutive_failures','duration_median',
    'volume_change','source_health'
  )),
  current_window_minutes integer check (current_window_minutes is null or current_window_minutes between 15 and 525600),
  reference_window_minutes integer check (reference_window_minutes is null or reference_window_minutes between 60 and 1576800),
  minimum_current_samples integer not null default 3 check (minimum_current_samples between 1 and 10000),
  minimum_reference_samples integer not null default 7 check (minimum_reference_samples between 1 and 100000),
  minimum_consecutive_periods integer not null default 1 check (minimum_consecutive_periods between 1 and 30),
  deviation_threshold_pct numeric(12,4) check (deviation_threshold_pct is null or deviation_threshold_pct between 0.01 and 10000),
  recovery_threshold_pct numeric(12,4) check (recovery_threshold_pct is null or recovery_threshold_pct between 0 and 10000),
  importance smallint not null default 3 check (importance between 1 and 5),
  client_publication_mode text not null default 'review_required'
    check (client_publication_mode in ('internal_only','review_required','auto_publish')),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration)='object'),
  status text not null default 'active' check (status in ('active','disabled')),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  check (num_nonnulls(metric_id,workflow_id,measurement_source_id)=1),
  check (
    (entity_type='metric' and metric_id is not null) or
    (entity_type='workflow' and workflow_id is not null) or
    (entity_type='measurement_source' and measurement_source_id is not null)
  ),
  check (recovery_threshold_pct is null or deviation_threshold_pct is null or recovery_threshold_pct <= deviation_threshold_pct),
  foreign key (organization_id,metric_id) references public.measurement_metrics(organization_id,id) on delete cascade,
  foreign key (organization_id,workflow_id) references public.implementation_workflows(organization_id,id) on delete cascade,
  foreign key (organization_id,measurement_source_id) references public.measurement_sources(organization_id,id) on delete cascade,
  foreign key (organization_id,created_by_membership_id) references public.organization_memberships(organization_id,id) on delete set null (created_by_membership_id),
  foreign key (organization_id,updated_by_membership_id) references public.organization_memberships(organization_id,id) on delete set null (updated_by_membership_id)
);

create unique index operational_signal_rules_identity_idx
  on public.operational_signal_rules (organization_id,signal_type,entity_type,related_entity_id)
  where status='active';
create index operational_signal_rules_metric_idx on public.operational_signal_rules (organization_id,metric_id) where metric_id is not null;
create index operational_signal_rules_workflow_idx on public.operational_signal_rules (organization_id,workflow_id) where workflow_id is not null;
create index operational_signal_rules_source_idx on public.operational_signal_rules (organization_id,measurement_source_id) where measurement_source_id is not null;

create table public.operational_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid,
  identity_key text not null check (identity_key ~ '^[0-9a-f]{64}$'),
  signal_type text not null check (signal_type in (
    'workflow_failure_rate','workflow_repeated_failures','workflow_duration',
    'workflow_throughput','metric_deterioration','metric_improvement',
    'metric_volume','metric_target_breach','metric_baseline_deviation',
    'source_stale','source_degraded','source_sync_failures',
    'economic_value_deterioration','economic_input_stale'
  )),
  entity_type text not null check (entity_type in ('metric','workflow','measurement_source')),
  metric_id uuid,
  workflow_id uuid,
  measurement_source_id uuid,
  process_id uuid,
  operational_area_id uuid,
  related_entity_id uuid generated always as (coalesce(metric_id,workflow_id,measurement_source_id)) stored,
  title text not null check (length(trim(title)) between 2 and 180),
  business_summary text not null check (length(trim(business_summary)) between 2 and 1000),
  detection_method text not null check (detection_method in (
    'percentage_deviation','rolling_median','consecutive_deterioration',
    'threshold_breach','failure_rate','consecutive_failures','duration_median',
    'volume_change','source_health'
  )),
  current_value numeric,
  reference_value numeric,
  absolute_deviation numeric,
  percentage_deviation numeric,
  unit text check (unit is null or length(unit)<=40),
  severity text not null check (severity in ('info','low','medium','high','critical')),
  confidence text not null check (confidence in ('low','medium','high')),
  current_window_start timestamptz,
  current_window_end timestamptz,
  reference_window_start timestamptz,
  reference_window_end timestamptz,
  current_sample_size integer not null default 0 check (current_sample_size>=0),
  reference_sample_size integer not null default 0 check (reference_sample_size>=0),
  consecutive_periods integer not null default 1 check (consecutive_periods between 1 and 1000000),
  first_detected_at timestamptz not null,
  last_observed_at timestamptz not null,
  status text not null default 'active' check (status in ('active','monitoring','acknowledged','resolved','dismissed')),
  resolved_at timestamptz,
  visibility_status text not null default 'internal_only'
    check (visibility_status in ('internal_only','reviewed','client_visible')),
  publication_reason text check (publication_reason is null or publication_reason in ('analyst_review','automatic_infrastructure')),
  reviewed_by_membership_id uuid,
  reviewed_at timestamptz,
  evidence_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_summary)='object'),
  economic_context jsonb not null default '{}'::jsonb check (jsonb_typeof(economic_context)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,identity_key),
  check (num_nonnulls(metric_id,workflow_id,measurement_source_id)=1),
  check (
    (entity_type='metric' and metric_id is not null) or
    (entity_type='workflow' and workflow_id is not null) or
    (entity_type='measurement_source' and measurement_source_id is not null)
  ),
  check ((status='resolved') = (resolved_at is not null)),
  check (last_observed_at>=first_detected_at),
  check (
    (visibility_status='internal_only' and publication_reason is null) or
    (visibility_status='reviewed' and publication_reason='analyst_review' and reviewed_by_membership_id is not null and reviewed_at is not null) or
    (visibility_status='client_visible' and publication_reason is not null and (
      (publication_reason='analyst_review' and reviewed_by_membership_id is not null and reviewed_at is not null) or
      (publication_reason='automatic_infrastructure' and reviewed_by_membership_id is null)
    ))
  ),
  check (evidence_summary::text !~* '"[^\"]*(secret|token|password|authorization|api[_ -]?key)[^\"]*"[[:space:]]*:'),
  check (economic_context::text !~* '"[^\"]*(secret|token|password|authorization|api[_ -]?key)[^\"]*"[[:space:]]*:'),
  foreign key (organization_id,rule_id) references public.operational_signal_rules(organization_id,id) on delete set null (rule_id),
  foreign key (organization_id,metric_id) references public.measurement_metrics(organization_id,id) on delete cascade,
  foreign key (organization_id,workflow_id) references public.implementation_workflows(organization_id,id) on delete cascade,
  foreign key (organization_id,measurement_source_id) references public.measurement_sources(organization_id,id) on delete cascade,
  foreign key (organization_id,process_id) references public.processes(organization_id,id) on delete set null (process_id),
  foreign key (organization_id,operational_area_id) references public.operational_areas(organization_id,id) on delete set null (operational_area_id),
  foreign key (organization_id,reviewed_by_membership_id) references public.organization_memberships(organization_id,id) on delete set null (reviewed_by_membership_id)
);

create index operational_signals_attention_idx
  on public.operational_signals (organization_id,status,severity,last_observed_at desc)
  where status in ('active','monitoring','acknowledged');
create index operational_signals_type_idx on public.operational_signals (organization_id,signal_type,last_observed_at desc);
create index operational_signals_entity_idx on public.operational_signals (organization_id,entity_type,related_entity_id,last_observed_at desc);
create index operational_signals_metric_idx on public.operational_signals (organization_id,metric_id,last_observed_at desc) where metric_id is not null;
create index operational_signals_workflow_idx on public.operational_signals (organization_id,workflow_id,last_observed_at desc) where workflow_id is not null;
create index operational_signals_source_idx on public.operational_signals (organization_id,measurement_source_id,last_observed_at desc) where measurement_source_id is not null;
create index operational_signals_area_idx on public.operational_signals (organization_id,operational_area_id,status) where operational_area_id is not null;
create index operational_signals_client_idx on public.operational_signals (organization_id,status,severity,last_observed_at desc) where visibility_status='client_visible';

create table public.operational_signal_internal_details (
  organization_id uuid not null,
  signal_id uuid not null,
  internal_notes text check (internal_notes is null or length(internal_notes)<=5000),
  last_evaluation_details jsonb not null default '{}'::jsonb check (jsonb_typeof(last_evaluation_details)='object'),
  updated_by_membership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,signal_id),
  foreign key (organization_id,signal_id) references public.operational_signals(organization_id,id) on delete cascade,
  foreign key (organization_id,updated_by_membership_id) references public.organization_memberships(organization_id,id) on delete set null (updated_by_membership_id)
);

create table public.operational_signal_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_id uuid not null,
  event_type text not null check (event_type in (
    'detected','updated','severity_changed','acknowledged','monitoring',
    'resolved','reopened','dismissed','published'
  )),
  summary text not null check (length(trim(summary)) between 2 and 500),
  from_status text,
  to_status text,
  from_severity text,
  to_severity text,
  current_value numeric,
  reference_value numeric,
  client_visible boolean not null default false,
  actor_membership_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (organization_id,signal_id) references public.operational_signals(organization_id,id) on delete cascade,
  foreign key (organization_id,actor_membership_id) references public.organization_memberships(organization_id,id) on delete set null (actor_membership_id)
);

create index operational_signal_events_timeline_idx on public.operational_signal_events (organization_id,signal_id,occurred_at desc);
create index operational_signal_events_client_idx on public.operational_signal_events (organization_id,occurred_at desc) where client_visible;

create table public.operational_signal_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid not null,
  signal_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  outcome text not null check (outcome in ('triggered','updated','normal','suppressed','insufficient_data','recovered','error')),
  reason_code text not null check (length(trim(reason_code)) between 2 and 120),
  current_value numeric,
  reference_value numeric,
  current_sample_size integer not null default 0 check (current_sample_size>=0),
  reference_sample_size integer not null default 0 check (reference_sample_size>=0),
  current_window_start timestamptz,
  current_window_end timestamptz,
  reference_window_start timestamptz,
  reference_window_end timestamptz,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  evaluated_at timestamptz not null default now(),
  unique (organization_id,correlation_id),
  foreign key (organization_id,rule_id) references public.operational_signal_rules(organization_id,id) on delete cascade,
  foreign key (organization_id,signal_id) references public.operational_signals(organization_id,id) on delete set null (signal_id)
);

create index operational_signal_evaluations_rule_idx on public.operational_signal_evaluations (organization_id,rule_id,evaluated_at desc);
create index operational_signal_evaluations_outcome_idx on public.operational_signal_evaluations (organization_id,outcome,evaluated_at desc);

create trigger operational_signal_rules_updated_at before update on public.operational_signal_rules
  for each row execute function public.set_updated_at();
create trigger operational_signals_updated_at before update on public.operational_signals
  for each row execute function public.set_updated_at();
create trigger operational_signal_internal_details_updated_at before update on public.operational_signal_internal_details
  for each row execute function public.set_updated_at();

create function private.stage5a_signal_actor(target_organization_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select membership.id
  from public.organization_memberships membership
  where membership.organization_id=target_organization_id
    and membership.user_id=(select auth.uid())
    and membership.status='active'
    and membership.role in ('delaro_admin','delaro_consultant')
  order by membership.created_at
  limit 1;
$$;
revoke all on function private.stage5a_signal_actor(uuid) from public,anon,authenticated;
grant execute on function private.stage5a_signal_actor(uuid) to authenticated;

create function private.stage5a_guard_rule() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  if (select auth.role())='service_role' then return new; end if;
  actor:=private.stage5a_signal_actor(new.organization_id);
  if actor is null then raise insufficient_privilege using message='Internal intelligence access required'; end if;
  if tg_op='UPDATE' and (new.organization_id is distinct from old.organization_id or new.id is distinct from old.id) then
    raise check_violation using message='Signal rule identity is immutable';
  end if;
  if tg_op='INSERT' then new.created_by_membership_id:=actor; end if;
  new.updated_by_membership_id:=actor;
  return new;
end $$;
create trigger operational_signal_rules_guard before insert or update on public.operational_signal_rules
  for each row execute function private.stage5a_guard_rule();

create function private.stage5a_guard_signal_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  if (select auth.role())='service_role' then return new; end if;
  actor:=private.stage5a_signal_actor(old.organization_id);
  if actor is null then raise insufficient_privilege using message='Internal intelligence access required'; end if;
  if new.organization_id is distinct from old.organization_id
     or new.id is distinct from old.id
     or new.rule_id is distinct from old.rule_id
     or new.identity_key is distinct from old.identity_key
     or new.signal_type is distinct from old.signal_type
     or new.entity_type is distinct from old.entity_type
     or new.metric_id is distinct from old.metric_id
     or new.workflow_id is distinct from old.workflow_id
     or new.measurement_source_id is distinct from old.measurement_source_id
     or new.process_id is distinct from old.process_id
     or new.operational_area_id is distinct from old.operational_area_id
     or new.title is distinct from old.title
     or new.business_summary is distinct from old.business_summary
     or new.detection_method is distinct from old.detection_method
     or new.current_value is distinct from old.current_value
     or new.reference_value is distinct from old.reference_value
     or new.absolute_deviation is distinct from old.absolute_deviation
     or new.percentage_deviation is distinct from old.percentage_deviation
     or new.unit is distinct from old.unit
     or new.severity is distinct from old.severity
     or new.confidence is distinct from old.confidence
     or new.current_window_start is distinct from old.current_window_start
     or new.current_window_end is distinct from old.current_window_end
     or new.reference_window_start is distinct from old.reference_window_start
     or new.reference_window_end is distinct from old.reference_window_end
     or new.current_sample_size is distinct from old.current_sample_size
     or new.reference_sample_size is distinct from old.reference_sample_size
     or new.consecutive_periods is distinct from old.consecutive_periods
     or new.first_detected_at is distinct from old.first_detected_at
     or new.last_observed_at is distinct from old.last_observed_at
     or new.evidence_summary is distinct from old.evidence_summary
     or new.economic_context is distinct from old.economic_context
     or new.created_at is distinct from old.created_at then
    raise check_violation using message='Detected signal evidence is evaluator-managed';
  end if;
  if new.visibility_status in ('reviewed','client_visible') and new.visibility_status is distinct from old.visibility_status then
    new.publication_reason:='analyst_review';
    new.reviewed_by_membership_id:=actor;
    new.reviewed_at:=clock_timestamp();
  elsif new.visibility_status='internal_only' then
    new.publication_reason:=null;
    new.reviewed_by_membership_id:=null;
    new.reviewed_at:=null;
  end if;
  if new.status='resolved' then new.resolved_at:=coalesce(old.resolved_at,clock_timestamp());
  elsif new.status is distinct from 'resolved' then new.resolved_at:=null;
  end if;
  return new;
end $$;
create trigger operational_signals_review_guard before update on public.operational_signals
  for each row execute function private.stage5a_guard_signal_review();

create function private.stage5a_record_signal_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare lifecycle text; event_summary text; actor uuid;
begin
  actor:=case when (select auth.role())='service_role' then null else private.stage5a_signal_actor(new.organization_id) end;
  if tg_op='INSERT' then
    lifecycle:='detected';
    event_summary:=new.title || ' detected.';
  elsif new.status is distinct from old.status then
    lifecycle:=case new.status when 'acknowledged' then 'acknowledged' when 'monitoring' then 'monitoring'
      when 'resolved' then 'resolved' when 'dismissed' then 'dismissed' when 'active' then 'reopened' else 'updated' end;
    event_summary:=new.title || case new.status when 'resolved' then ' returned to its recovery range.'
      when 'dismissed' then ' was dismissed after review.' when 'acknowledged' then ' was acknowledged.'
      when 'monitoring' then ' is being monitored.' when 'active' then ' became active again.' else ' changed status.' end;
  elsif new.severity is distinct from old.severity then
    lifecycle:='severity_changed'; event_summary:=new.title || ' changed severity.';
  elsif new.visibility_status='client_visible' and old.visibility_status is distinct from 'client_visible' then
    lifecycle:='published'; event_summary:=new.title || ' is now visible in the client workspace.';
  else
    return new;
  end if;
  insert into public.operational_signal_events(
    organization_id,signal_id,event_type,summary,from_status,to_status,from_severity,to_severity,
    current_value,reference_value,client_visible,actor_membership_id,occurred_at
  ) values (
    new.organization_id,new.id,lifecycle,event_summary,
    case when tg_op='UPDATE' then old.status end,new.status,
    case when tg_op='UPDATE' then old.severity end,new.severity,
    new.current_value,new.reference_value,new.visibility_status='client_visible',actor,clock_timestamp()
  );
  return new;
end $$;
create trigger operational_signals_lifecycle after insert or update on public.operational_signals
  for each row execute function private.stage5a_record_signal_lifecycle();

alter table public.operational_signal_rules enable row level security;
alter table public.operational_signals enable row level security;
alter table public.operational_signal_internal_details enable row level security;
alter table public.operational_signal_events enable row level security;
alter table public.operational_signal_evaluations enable row level security;

revoke all on public.operational_signal_rules,public.operational_signals,
  public.operational_signal_internal_details,public.operational_signal_events,
  public.operational_signal_evaluations from anon,authenticated;
grant select,insert,update,delete on public.operational_signal_rules to authenticated;
grant select,update on public.operational_signals to authenticated;
grant select,insert,update on public.operational_signal_internal_details to authenticated;
grant select on public.operational_signal_events,public.operational_signal_evaluations to authenticated;

create policy "Internal users manage signal rules" on public.operational_signal_rules for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users read signals" on public.operational_signals for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users review signals" on public.operational_signals for update to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read published signals" on public.operational_signals for select to authenticated
  using (visibility_status='client_visible' and private.is_org_member(organization_id));
create policy "Internal users manage signal details" on public.operational_signal_internal_details for all to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users read signal events" on public.operational_signal_events for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read published signal events" on public.operational_signal_events for select to authenticated
  using (client_visible and private.is_org_member(organization_id) and exists (
    select 1 from public.operational_signals signal
    where signal.organization_id=operational_signal_events.organization_id
      and signal.id=operational_signal_events.signal_id
      and signal.visibility_status='client_visible'
  ));
create policy "Internal users read signal evaluations" on public.operational_signal_evaluations for select to authenticated
  using (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

-- Link meaningful client-safe signal lifecycle events into the existing activity feed.
alter table public.system_events add column operational_signal_id uuid;
alter table public.system_events add constraint system_events_signal_tenant_fk
  foreign key (organization_id,operational_signal_id)
  references public.operational_signals(organization_id,id) on delete set null (operational_signal_id);
create index system_events_signal_idx on public.system_events (organization_id,operational_signal_id)
  where operational_signal_id is not null;

alter table public.system_events drop constraint if exists system_events_event_type_check;
alter table public.system_events add constraint system_events_event_type_check check (event_type in (
  'order_sync','invoice_review','sla_breach','integration_failure','manual_override',
  'approval_completed','measurement_updated','process_changed','signal_detected','signal_recovered','other'
));

drop policy if exists "Members read published operational events" on public.system_events;
create policy "Members read published operational events" on public.system_events for select to authenticated
  using (
    client_visible and private.is_org_member(organization_id)
    and (system_id is null or exists (select 1 from public.systems s
      where s.organization_id=system_events.organization_id and s.id=system_events.system_id and s.client_visible))
    and (process_id is null or exists (select 1 from public.processes p
      where p.organization_id=system_events.organization_id and p.id=system_events.process_id and p.client_visible))
    and (decision_id is null or exists (select 1 from public.decisions d
      where d.organization_id=system_events.organization_id and d.id=system_events.decision_id and d.client_visible))
    and (operational_signal_id is null or exists (select 1 from public.operational_signals signal
      where signal.organization_id=system_events.organization_id and signal.id=system_events.operational_signal_id
        and signal.visibility_status='client_visible'))
  );

create function private.stage5a_publish_signal_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare signal public.operational_signals%rowtype;
begin
  if not new.client_visible or new.event_type not in ('detected','published','resolved') then return new; end if;
  select * into signal from public.operational_signals item
  where item.organization_id=new.organization_id and item.id=new.signal_id;
  if not found or signal.visibility_status<>'client_visible' then return new; end if;
  insert into public.system_events(
    organization_id,process_id,operational_signal_id,event_type,severity,summary,status,source,occurred_at,client_visible
  ) values (
    new.organization_id,signal.process_id,signal.id,
    case when new.event_type='resolved' then 'signal_recovered' else 'signal_detected' end,
    case when signal.severity='critical' then 'critical' when signal.severity in ('medium','high') then 'warning' else 'info' end,
    new.summary,case when new.event_type='resolved' then 'resolved' else 'needs_attention' end,
    'Operational intelligence',new.occurred_at,true
  );
  return new;
end $$;
create trigger operational_signal_events_activity after insert on public.operational_signal_events
  for each row execute function private.stage5a_publish_signal_activity();

comment on table public.operational_signal_rules is 'Internal deterministic detection configuration. Never client-readable.';
comment on table public.operational_signals is 'Client-safe explainable operational signals. Internal notes live separately.';
comment on table public.operational_signal_evaluations is 'Internal audit ledger for triggered, normal, suppressed, and insufficient-data evaluations.';
