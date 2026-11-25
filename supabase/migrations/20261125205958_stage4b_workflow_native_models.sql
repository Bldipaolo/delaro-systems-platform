-- A value model may be native to an independently registered monitored workflow.
alter table public.value_models
  add column workflow_id uuid,
  add constraint value_models_workflow_fk
    foreign key (organization_id, workflow_id)
    references public.implementation_workflows(organization_id, id) on delete restrict;
alter table public.value_models drop constraint value_models_check;
alter table public.value_models add constraint value_models_subject_check
  check (num_nonnulls(initiative_id, opportunity_id, workflow_id) >= 1);
create index value_models_workflow_idx on public.value_models (organization_id, workflow_id)
  where workflow_id is not null;
