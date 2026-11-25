-- Cover Stage 4B composite foreign keys used during evidence and membership checks.
create index value_model_costs_evidence_idx
  on public.value_model_costs (organization_id, model_id, evidence_id)
  where evidence_id is not null;
create index value_model_costs_verifier_idx
  on public.value_model_costs (organization_id, verified_by_membership_id)
  where verified_by_membership_id is not null;
create index value_model_metric_links_metric_idx
  on public.value_model_metric_links (organization_id, metric_id);
create index value_model_validations_model_idx
  on public.value_model_validations (organization_id, model_id);
create index value_model_validations_requester_idx
  on public.value_model_validations (organization_id, requested_by_membership_id);
create index value_model_validations_responder_idx
  on public.value_model_validations (organization_id, responded_by_membership_id)
  where responded_by_membership_id is not null;
