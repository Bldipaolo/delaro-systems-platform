-- Reuse public.systems from the operational model. Client-facing event fields
-- are deliberately separate from unstructured technical diagnostics.
create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  system_id uuid,
  initiative_id uuid,
  process_id uuid,
  decision_id uuid,
  event_type text not null check (event_type in (
    'order_sync','invoice_review','sla_breach','integration_failure','manual_override',
    'approval_completed','measurement_updated','process_changed','other'
  )),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  summary text not null check (length(trim(summary)) between 1 and 500),
  status text not null default 'recorded' check (status in ('recorded','needs_attention','resolved')),
  source text not null check (length(trim(source)) between 1 and 160),
  occurred_at timestamptz not null,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,system_id) references public.systems(organization_id,id) on delete set null (system_id),
  foreign key (organization_id,initiative_id) references public.initiatives(organization_id,id) on delete set null (initiative_id),
  foreign key (organization_id,process_id) references public.processes(organization_id,id) on delete set null (process_id),
  foreign key (organization_id,decision_id) references public.decisions(organization_id,id) on delete set null (decision_id)
);

-- Metadata, source references, and stack-level detail are never on a client-readable row.
create table public.system_event_diagnostics (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  source_reference text,
  technical_details text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,event_id),
  foreign key (organization_id,event_id) references public.system_events(organization_id,id) on delete cascade
);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  decision_id uuid,
  title text not null check (length(trim(title)) between 1 and 180),
  client_summary text not null check (length(trim(client_summary)) between 1 and 1000),
  status text not null default 'open' check (status in ('open','investigating','awaiting_client','resolved','dismissed')),
  assigned_to_membership_id uuid,
  client_visible boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,event_id),
  check ((status = 'resolved') = (resolved_at is not null)),
  foreign key (organization_id,event_id) references public.system_events(organization_id,id) on delete cascade,
  foreign key (organization_id,decision_id) references public.decisions(organization_id,id) on delete set null (decision_id),
  foreign key (organization_id,assigned_to_membership_id)
    references public.organization_memberships(organization_id,id) on delete set null (assigned_to_membership_id)
);

create index system_events_org_recent_idx on public.system_events (organization_id,occurred_at desc,id desc);
create index system_events_client_recent_idx on public.system_events (organization_id,occurred_at desc,id desc) where client_visible;
create index system_events_org_status_idx on public.system_events (organization_id,status,occurred_at desc);
create index system_events_system_idx on public.system_events (organization_id,system_id);
create index system_events_initiative_idx on public.system_events (organization_id,initiative_id);
create index system_events_process_idx on public.system_events (organization_id,process_id);
create index system_events_decision_idx on public.system_events (organization_id,decision_id);
create index exceptions_org_open_idx on public.exceptions (organization_id,status,created_at desc)
  where status not in ('resolved','dismissed');
create index exceptions_decision_idx on public.exceptions (organization_id,decision_id);
create index exceptions_assignee_idx on public.exceptions (organization_id,assigned_to_membership_id);

create trigger system_events_updated_at before update on public.system_events
  for each row execute function public.set_updated_at();
create trigger system_event_diagnostics_updated_at before update on public.system_event_diagnostics
  for each row execute function public.set_updated_at();
create trigger exceptions_updated_at before update on public.exceptions
  for each row execute function public.set_updated_at();

alter table public.system_events enable row level security;
alter table public.system_event_diagnostics enable row level security;
alter table public.exceptions enable row level security;
revoke all on public.system_events,public.system_event_diagnostics,public.exceptions from anon,authenticated;
grant select,insert,update,delete on public.system_events,public.system_event_diagnostics,public.exceptions to authenticated;

create policy "Delaro manages operational events" on public.system_events for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read published operational events" on public.system_events for select to authenticated
  using (client_visible and public.is_org_member(organization_id)
    and (system_id is null or exists (select 1 from public.systems s
      where s.organization_id=system_events.organization_id and s.id=system_events.system_id and s.client_visible))
    and (process_id is null or exists (select 1 from public.processes p
      where p.organization_id=system_events.organization_id and p.id=system_events.process_id and p.client_visible))
    and (decision_id is null or exists (select 1 from public.decisions d
      where d.organization_id=system_events.organization_id and d.id=system_events.decision_id and d.client_visible)));

create policy "Delaro manages event diagnostics" on public.system_event_diagnostics for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

create policy "Delaro manages exceptions" on public.exceptions for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read published exceptions" on public.exceptions for select to authenticated
  using (client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.system_events e where e.organization_id=exceptions.organization_id
      and e.id=exceptions.event_id and e.client_visible
  ));

-- A completed human decision is meaningful operational activity. Technical
-- retries and other system noise are not auto-published as client events.
create function private.record_approved_decision_activity() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.status = 'approved' and old.status is distinct from new.status then
    insert into public.system_events(organization_id,initiative_id,process_id,decision_id,
      event_type,severity,summary,status,source,occurred_at,client_visible)
    values (new.organization_id,new.initiative_id,new.process_id,new.id,
      'approval_completed','info','Decision approved: ' || new.title,'recorded',
      'Shared decision',coalesce(new.decided_at,now()),new.client_visible);
  end if;
  return new;
end $$;
revoke all on function private.record_approved_decision_activity() from public,anon,authenticated;
create trigger decisions_operational_activity after update on public.decisions
  for each row execute function private.record_approved_decision_activity();
