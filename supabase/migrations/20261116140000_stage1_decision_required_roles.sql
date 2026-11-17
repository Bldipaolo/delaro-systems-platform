-- Explicitly record the client role required for a human approval.
alter table public.decisions
  add column required_approval_role public.organization_member_role not null default 'client_user'
  check (required_approval_role in ('client_admin','client_user'));

create or replace function private.validate_approval_response() returns trigger language plpgsql
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
  if target_decision.required_approval_role = 'client_admin' and actor.role not in ('client_admin','delaro_admin') then
    raise exception 'This approval requires a client administrator';
  end if;
  if target_decision.required_approval_role = 'client_user' and actor.role not in ('client_admin','client_user','delaro_admin') then
    raise exception 'This approval requires an authorized client member';
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
