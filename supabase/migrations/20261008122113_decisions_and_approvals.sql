-- Client decisions are distinct from check-in records. Every write is tenant-scoped.
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid,
  opportunity_id uuid,
  initiative_id uuid,
  kind text not null check (kind in ('approval','question','exception','recommendation')),
  risk_level text not null default 'standard' check (risk_level in ('standard','elevated','high')),
  title text not null check (length(trim(title)) > 0),
  context text not null check (length(trim(context)) > 0),
  why_needed text not null check (length(trim(why_needed)) > 0),
  recommendation text,
  financial_consequence text,
  operational_consequence text,
  requested_from_membership_id uuid not null,
  requested_by_membership_id uuid not null,
  due_date date,
  status text not null default 'open' check (status in ('open','in_discussion','changes_requested','approved','declined','resolved','cancelled')),
  selected_option_id uuid,
  selected_outcome text,
  decided_at timestamptz,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((status in ('approved','declined','resolved')) = (decided_at is not null)),
  foreign key (organization_id, process_id) references public.processes(organization_id, id) on delete restrict,
  foreign key (organization_id, opportunity_id) references public.opportunities(organization_id, id) on delete restrict,
  foreign key (organization_id, initiative_id) references public.initiatives(organization_id, id) on delete restrict,
  foreign key (organization_id, requested_from_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, requested_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  description text,
  consequence text,
  is_recommended boolean not null default false,
  client_visible boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, decision_id, id),
  foreign key (organization_id, decision_id) references public.decisions(organization_id, id) on delete cascade
);
create unique index decision_one_recommendation_idx on public.decision_options (organization_id, decision_id) where is_recommended;
alter table public.decisions add constraint decisions_selected_option_same_decision_fk
  foreign key (organization_id, id, selected_option_id)
  references public.decision_options(organization_id, decision_id, id) on delete restrict;

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision_id uuid not null,
  requested_from_membership_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','declined')),
  selected_option_id uuid,
  response_note text,
  confirmation_text text,
  responded_by_membership_id uuid,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, decision_id, requested_from_membership_id),
  check ((status = 'pending') = (responded_at is null)),
  foreign key (organization_id, decision_id) references public.decisions(organization_id, id) on delete cascade,
  foreign key (organization_id, decision_id, selected_option_id)
    references public.decision_options(organization_id, decision_id, id) on delete restrict,
  foreign key (organization_id, requested_from_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict,
  foreign key (organization_id, responded_by_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision_id uuid not null,
  author_membership_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  client_visible boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, decision_id) references public.decisions(organization_id, id) on delete cascade,
  foreign key (organization_id, author_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create table public.decision_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision_id uuid not null,
  actor_membership_id uuid,
  event_type text not null check (event_type in ('created','updated','status_changed','approval_responded','comment_added')),
  from_status text,
  to_status text,
  summary text not null,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, decision_id) references public.decisions(organization_id, id) on delete cascade,
  foreign key (organization_id, actor_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict
);

create index decisions_org_due_idx on public.decisions (organization_id, status, due_date);
create index decisions_assignee_idx on public.decisions (organization_id, requested_from_membership_id, status);
create index decisions_process_idx on public.decisions (organization_id, process_id);
create index decisions_opportunity_idx on public.decisions (organization_id, opportunity_id);
create index decisions_initiative_idx on public.decisions (organization_id, initiative_id);
create index decisions_requester_idx on public.decisions (organization_id, requested_by_membership_id);
create index decision_options_decision_idx on public.decision_options (organization_id, decision_id, sort_order);
create index approvals_assignee_idx on public.approvals (organization_id, requested_from_membership_id, status);
create index approvals_option_idx on public.approvals (organization_id, decision_id, selected_option_id);
create index approvals_responder_idx on public.approvals (organization_id, responded_by_membership_id);
create index comments_decision_idx on public.comments (organization_id, decision_id, created_at);
create index comments_author_idx on public.comments (organization_id, author_membership_id);
create index decision_events_decision_idx on public.decision_events (organization_id, decision_id, occurred_at);
create index decision_events_actor_idx on public.decision_events (organization_id, actor_membership_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Even internal editors cannot fabricate an approved/declined human decision.
create function private.validate_decision_transition() returns trigger language plpgsql
set search_path = '' as $$
declare request_count integer; approved_count integer; chosen_count integer; declined_count integer;
begin
  if new.kind = 'approval' and new.status in ('approved','declined') and
     (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select count(*), count(*) filter (where status='approved'),
      count(distinct selected_option_id) filter (where status='approved'),
      count(*) filter (where status='declined')
      into request_count, approved_count, chosen_count, declined_count
      from public.approvals where organization_id=new.organization_id and decision_id=new.id;
    if new.status='approved' and not (request_count > 0 and approved_count=request_count and chosen_count=1
      and exists (select 1 from public.approvals a where a.organization_id=new.organization_id
        and a.decision_id=new.id and a.selected_option_id=new.selected_option_id)) then
      raise exception 'Approved decisions require matching human approvals';
    end if;
    if new.status='declined' and declined_count=0 then
      raise exception 'Declined decisions require a human response';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_decision_transition() from public, anon, authenticated;
create trigger decisions_validate_transition before insert or update on public.decisions
  for each row execute function private.validate_decision_transition();

-- Approval responses are accepted only from the assigned, active human member.
create function private.validate_approval_response() returns trigger language plpgsql
set search_path = '' as $$
declare target_decision public.decisions%rowtype; actor public.organization_memberships%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.responded_at is not null then
      raise exception 'Approval requests must begin pending';
    end if;
    return new;
  end if;
  if row(new.organization_id,new.decision_id,new.requested_from_membership_id) is distinct from
     row(old.organization_id,old.decision_id,old.requested_from_membership_id) then
    raise exception 'Approval assignment cannot be changed';
  end if;
  if old.status <> 'pending' then
    if new.status <> 'pending' or not public.has_org_role(new.organization_id,
      array['delaro_admin','delaro_consultant']::public.organization_member_role[]) then
      raise exception 'An answered approval is final until Delaro reopens it';
    end if;
    new.selected_option_id := null; new.response_note := null; new.confirmation_text := null;
    new.responded_by_membership_id := null; new.responded_at := null;
    return new;
  end if;
  if new.status not in ('approved','changes_requested','declined') then
    raise exception 'Select a response or add a comment';
  end if;
  select * into actor from public.organization_memberships
    where id = new.requested_from_membership_id and organization_id = new.organization_id
      and user_id = (select auth.uid()) and status = 'active';
  if not found or actor.role = 'read_only' then
    raise exception 'Only the assigned member may respond';
  end if;
  select * into target_decision from public.decisions where id = new.decision_id and organization_id = new.organization_id;
  if not found or not target_decision.client_visible or target_decision.status not in ('open','in_discussion') then
    raise exception 'This decision is not open for a response';
  end if;
  if new.status = 'approved' then
    if new.selected_option_id is null or not exists (
      select 1 from public.decision_options o where o.id = new.selected_option_id
        and o.organization_id = new.organization_id and o.decision_id = new.decision_id and o.client_visible) then
      raise exception 'Select a published option to approve';
    end if;
    if target_decision.risk_level in ('elevated','high') and new.confirmation_text <> 'APPROVE' then
      raise exception 'Explicit approval confirmation is required';
    end if;
    if target_decision.risk_level = 'high' and actor.role not in ('client_admin','delaro_admin') then
      raise exception 'High-risk approval requires an administrator';
    end if;
  elsif length(trim(coalesce(new.response_note,''))) < 5 then
    raise exception 'Explain the requested change or decline';
  end if;
  new.responded_by_membership_id := actor.id;
  new.responded_at := now();
  return new;
end $$;
revoke all on function private.validate_approval_response() from public, anon, authenticated;
create trigger approvals_validate_response before insert or update on public.approvals
  for each row execute function private.validate_approval_response();

-- Apply the response and decision transition in the same database transaction.
create function private.apply_approval_response() returns trigger language plpgsql security definer
set search_path = '' as $$
declare request_count integer; approved_count integer; option_count integer; chosen_option uuid; chosen_title text;
begin
  if new.status = old.status then return new; end if;
  insert into public.decision_events(organization_id,decision_id,actor_membership_id,event_type,
    from_status,to_status,summary)
  values (new.organization_id,new.decision_id,new.responded_by_membership_id,
    'approval_responded',old.status,new.status,'Approval response: ' || replace(new.status,'_',' '));
  if new.status = 'pending' then
    update public.decisions set status='open', selected_option_id=null, selected_outcome=null, decided_at=null
      where organization_id=new.organization_id and id=new.decision_id;
  elsif new.status = 'changes_requested' then
    update public.decisions set status='changes_requested', selected_option_id=null, selected_outcome=null, decided_at=null
      where organization_id=new.organization_id and id=new.decision_id;
  elsif new.status = 'declined' then
    update public.decisions set status='declined', selected_option_id=null, selected_outcome='Declined', decided_at=now()
      where organization_id=new.organization_id and id=new.decision_id;
  else
    select count(*), count(*) filter (where status='approved'), count(distinct selected_option_id)
      into request_count, approved_count, option_count
      from public.approvals where organization_id=new.organization_id and decision_id=new.decision_id;
    if request_count > 0 and approved_count = request_count and option_count = 1 then
      chosen_option := new.selected_option_id;
      select title into chosen_title from public.decision_options
        where organization_id=new.organization_id and decision_id=new.decision_id and id=chosen_option;
      update public.decisions set status='approved', selected_option_id=chosen_option,
        selected_outcome=chosen_title, decided_at=now()
        where organization_id=new.organization_id and id=new.decision_id;
    else
      update public.decisions set status='in_discussion', selected_option_id=null, selected_outcome=null, decided_at=null
        where organization_id=new.organization_id and id=new.decision_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.apply_approval_response() from public, anon, authenticated;
create trigger approvals_apply_response after update on public.approvals
  for each row execute function private.apply_approval_response();

create function private.record_decision_event() returns trigger language plpgsql security definer
set search_path = '' as $$
declare actor_id uuid; kind text; event_summary text;
begin
  select id into actor_id from public.organization_memberships
    where organization_id=new.organization_id and user_id=(select auth.uid()) and status='active' limit 1;
  if tg_op = 'INSERT' then
    kind := 'created'; event_summary := 'Decision opened';
  elsif row(new.kind,new.risk_level,new.title,new.context,new.why_needed,new.recommendation,new.financial_consequence,
    new.operational_consequence,new.requested_from_membership_id,new.requested_by_membership_id,
    new.process_id,new.opportunity_id,new.initiative_id,new.due_date,new.status,new.selected_option_id,new.selected_outcome,new.client_visible)
    is not distinct from row(old.kind,old.risk_level,old.title,old.context,old.why_needed,old.recommendation,old.financial_consequence,
    old.operational_consequence,old.requested_from_membership_id,old.requested_by_membership_id,
    old.process_id,old.opportunity_id,old.initiative_id,old.due_date,old.status,old.selected_option_id,old.selected_outcome,old.client_visible) then
    return new;
  elsif new.status is distinct from old.status then
    kind := 'status_changed'; event_summary := 'Decision moved to ' || replace(new.status,'_',' ');
  else
    kind := 'updated'; event_summary := 'Decision details updated';
  end if;
  insert into public.decision_events(organization_id,decision_id,actor_membership_id,event_type,
    from_status,to_status,summary)
  values (new.organization_id,new.id,coalesce(actor_id,new.requested_by_membership_id),kind,
    case when tg_op='INSERT' then null else old.status end,new.status,event_summary);
  return new;
end $$;
revoke all on function private.record_decision_event() from public, anon, authenticated;
create trigger decisions_audit after insert or update on public.decisions
  for each row execute function private.record_decision_event();

create function private.record_decision_comment() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.decision_events(organization_id,decision_id,actor_membership_id,event_type,
    to_status,summary)
  select new.organization_id,new.decision_id,new.author_membership_id,'comment_added',d.status,'Discussion added'
  from public.decisions d where d.organization_id=new.organization_id and d.id=new.decision_id;
  return new;
end $$;
revoke all on function private.record_decision_comment() from public, anon, authenticated;
create trigger comments_audit after insert on public.comments
  for each row execute function private.record_decision_comment();

create trigger decisions_updated_at before update on public.decisions
  for each row execute function public.set_updated_at();
create trigger decision_options_updated_at before update on public.decision_options
  for each row execute function public.set_updated_at();
create trigger approvals_updated_at before update on public.approvals
  for each row execute function public.set_updated_at();

do $$ declare table_name text;
begin
  foreach table_name in array array['decisions','decision_options','approvals','comments','decision_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end $$;
grant insert, update, delete on public.decisions, public.decision_options to authenticated;
grant insert, update on public.approvals to authenticated;
grant insert on public.comments to authenticated;

create policy "Internal users manage decisions" on public.decisions for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read shared decisions" on public.decisions for select to authenticated
  using (client_visible and public.is_org_member(organization_id));

create policy "Internal users manage decision options" on public.decision_options for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read shared options" on public.decision_options for select to authenticated
  using (client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.decisions d where d.organization_id=decision_options.organization_id
      and d.id=decision_options.decision_id and d.client_visible));

create policy "Internal users manage approval requests" on public.approvals for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Assigned members read approvals" on public.approvals for select to authenticated
  using (exists (select 1 from public.organization_memberships m
    where m.organization_id=approvals.organization_id and m.id=approvals.requested_from_membership_id
      and m.user_id=(select auth.uid()) and m.status='active') and exists (
    select 1 from public.decisions d where d.organization_id=approvals.organization_id
      and d.id=approvals.decision_id and d.client_visible));
create policy "Assigned members respond to approvals" on public.approvals for update to authenticated
  using (status='pending' and exists (select 1 from public.organization_memberships m
    where m.organization_id=approvals.organization_id and m.id=approvals.requested_from_membership_id
      and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('client_admin','client_user')))
  with check (exists (select 1 from public.organization_memberships m
    where m.organization_id=approvals.organization_id and m.id=approvals.requested_from_membership_id
      and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('client_admin','client_user')));

create policy "Internal users manage comments" on public.comments for all to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]))
  with check (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read shared comments" on public.comments for select to authenticated
  using (client_visible and public.is_org_member(organization_id) and exists (
    select 1 from public.decisions d where d.organization_id=comments.organization_id
      and d.id=comments.decision_id and d.client_visible));
create policy "Members add discussion" on public.comments for insert to authenticated
  with check (client_visible and exists (select 1 from public.organization_memberships m
    where m.organization_id=comments.organization_id and m.id=comments.author_membership_id
      and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('client_admin','client_user'))
    and exists (select 1 from public.decisions d where d.organization_id=comments.organization_id
      and d.id=comments.decision_id and d.client_visible));

create policy "Internal users read decision history" on public.decision_events for select to authenticated
  using (public.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Members read shared decision history" on public.decision_events for select to authenticated
  using (public.is_org_member(organization_id) and exists (
    select 1 from public.decisions d where d.organization_id=decision_events.organization_id
      and d.id=decision_events.decision_id and d.client_visible));
