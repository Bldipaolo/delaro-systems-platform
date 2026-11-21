-- One SELECT policy avoids evaluating two permissive branches for every row.
drop policy "Internal users read workflow executions" on public.workflow_executions;
drop policy "Members read published workflow executions" on public.workflow_executions;
create policy "Authorized users read workflow executions"
  on public.workflow_executions for select to authenticated
  using (
    private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[])
    or private.can_view_client_workflow(organization_id,workflow_id)
  );
