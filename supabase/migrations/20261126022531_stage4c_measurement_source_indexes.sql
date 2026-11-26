-- Cover the tenant-scoped secret foreign key for delete and integrity checks.
create index measurement_source_secrets_tenant_idx
  on private.measurement_source_secrets (organization_id,source_id);
