-- Resolve Stage 3A advisor findings without widening client access.

create policy "No authenticated access to workflow rate windows"
  on public.workflow_ingestion_rate_windows for all to authenticated
  using (false) with check (false);

grant insert on public.workflow_integration_audit to authenticated;
create policy "Internal users append workflow integration audit"
  on public.workflow_integration_audit for insert to authenticated
  with check (private.has_org_role(organization_id,array['delaro_admin','delaro_consultant']::public.organization_member_role[]));

alter function public.rotate_workflow_ingestion_credential(uuid,uuid,text,text,text,integer,timestamptz)
  security invoker;
alter function public.revoke_workflow_ingestion_credential(uuid)
  security invoker;

create index workflow_credentials_created_by_idx
  on public.workflow_ingestion_credentials (organization_id,created_by_membership_id);
create index workflow_credentials_revoked_by_idx
  on public.workflow_ingestion_credentials (organization_id,revoked_by_membership_id)
  where revoked_by_membership_id is not null;
create index workflow_execution_events_credential_idx
  on public.workflow_execution_events (organization_id,credential_id);
create index workflow_rate_windows_tenant_credential_idx
  on public.workflow_ingestion_rate_windows (organization_id,credential_id);
create index workflow_integration_audit_workflow_idx
  on public.workflow_integration_audit (organization_id,workflow_id,occurred_at desc);
create index workflow_integration_audit_credential_idx
  on public.workflow_integration_audit (organization_id,credential_id)
  where credential_id is not null;
create index workflow_integration_audit_actor_idx
  on public.workflow_integration_audit (organization_id,actor_membership_id);
