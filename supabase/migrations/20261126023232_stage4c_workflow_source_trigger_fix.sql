-- Qualify the resolved source identifier so the workflow-metric trigger remains
-- compatible with the pre-existing n8n registration path.
create or replace function private.stage4c_sync_workflow_metric_source()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare resolved_source_id uuid;
declare workflow public.implementation_workflows%rowtype;
declare metric public.measurement_metrics%rowtype;
begin
  if tg_op = 'DELETE' then
    update public.measurement_source_mappings mapping set status='disabled'
    from public.measurement_sources source
    where source.organization_id=old.organization_id and source.workflow_id=old.workflow_id
      and mapping.organization_id=source.organization_id and mapping.source_id=source.id
      and mapping.metric_id=old.metric_id and mapping.status='active';
    return old;
  end if;
  select * into workflow from public.implementation_workflows stored
    where stored.organization_id=new.organization_id and stored.id=new.workflow_id;
  select * into metric from public.measurement_metrics stored
    where stored.organization_id=new.organization_id and stored.id=new.metric_id;
  insert into public.measurement_sources(
    organization_id,workflow_id,name,provider_type,connection_mode,external_reference,
    public_configuration,status,client_visible
  ) values (
    workflow.organization_id,workflow.id,workflow.workflow_name,'n8n','push',workflow.id::text,
    jsonb_build_object('workflow_id',workflow.id,'platform',workflow.platform),
    case when workflow.monitoring_status='connected' then 'healthy'
         when workflow.monitoring_status='degraded' then 'degraded' else 'configured' end,
    workflow.client_visible
  )
  on conflict (organization_id,workflow_id) where workflow_id is not null do update set
    name=excluded.name,public_configuration=excluded.public_configuration,
    status=excluded.status,client_visible=excluded.client_visible
  returning id into resolved_source_id;
  insert into public.measurement_source_mappings(
    organization_id,source_id,metric_id,name,provider_object,value_field,timestamp_field,
    external_id_field,aggregation_method,period_granularity,status,client_visible
  ) values (
    new.organization_id,resolved_source_id,new.metric_id,coalesce(nullif(trim(new.relationship),''),'Workflow metric'),
    'workflow_execution','value','measuredAt','eventId','latest','event','active',
    workflow.client_visible and metric.client_visible
  )
  on conflict (organization_id,source_id,metric_id) where status='active' do update set
    name=excluded.name,client_visible=excluded.client_visible;
  return new;
end $$;
