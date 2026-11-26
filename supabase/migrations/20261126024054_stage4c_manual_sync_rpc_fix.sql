-- Keep the manual request RPC security-invoker and grant only the table verbs
-- it needs. RLS remains the authorization boundary for direct Data API calls.
grant insert,update on public.measurement_sync_runs to authenticated;
create policy "Internal users create measurement sync requests" on public.measurement_sync_runs
  for insert to authenticated
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));
create policy "Internal users update queued measurement sync requests" on public.measurement_sync_runs
  for update to authenticated
  using (
    status='queued'
    and private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[])
  )
  with check (
    status='queued'
    and private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[])
  );
