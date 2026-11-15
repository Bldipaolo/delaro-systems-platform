-- Idempotent single-tenant showcase data for the Delaro Systems pilot workspace.
-- All records are illustrative. No observation, realized value, or ROI is verified.
do $$
declare
  org uuid := '31492c42-4188-4dd1-924d-a755a376e1d6';
  member uuid := 'a2fa5db4-c52c-46b5-bee6-26d7944dd060';
  user_id uuid := 'b92f6901-f27f-4da0-a179-a76764d4aa20';
begin
  -- Administrative seeding still passes the same reviewer-attribution guards as app writes.
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  update public.organizations
  set demo_mode = true,
      industry = 'Illustrative manufacturing engagement',
      description = 'Authenticated showcase workspace containing illustrative demo data.'
  where id = org;

  update public.profiles set full_name = coalesce(full_name, 'Bradley DiPaolo') where id = user_id;

  insert into public.operational_areas (id, organization_id, name, description, sort_order) values
    ('10000000-0000-4000-8000-000000000001', org, 'Sales', 'From enquiry through customer commitment.', 1),
    ('10000000-0000-4000-8000-000000000002', org, 'Operations', 'From approved work through production scheduling and delivery.', 2),
    ('10000000-0000-4000-8000-000000000003', org, 'Finance', 'From delivery confirmation through billing and collection.', 3)
  on conflict (id) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

  insert into public.systems (id, organization_id, name, category, system_of_record, description, integration_status, client_visible) values
    ('20000000-0000-4000-8000-000000000001', org, 'Customer CRM', 'Commercial', true, 'Illustrative customer agreement and quote history.', 'partial', true),
    ('20000000-0000-4000-8000-000000000002', org, 'Production ERP', 'Operations', true, 'Illustrative work-order and production schedule system.', 'partial', true),
    ('20000000-0000-4000-8000-000000000003', org, 'Shared order folder', 'Documents', false, 'Illustrative supporting specifications and approvals.', 'not_integrated', true)
  on conflict (id) do update set name = excluded.name, description = excluded.description, integration_status = excluded.integration_status, client_visible = true;

  insert into public.processes (id, organization_id, operational_area_id, name, description, owner_membership_id, status, sort_order, trigger_description, expected_output, downstream_effect, client_visible) values
    ('30000000-0000-4000-8000-000000000001', org, '10000000-0000-4000-8000-000000000001', 'Lead intake', 'Capture and route a new enquiry.', member, 'active', 1, 'A new enquiry arrives', 'Captured enquiry', 'Qualification can begin', true),
    ('30000000-0000-4000-8000-000000000002', org, '10000000-0000-4000-8000-000000000001', 'Qualification', 'Confirm fit, requirements, and commercial readiness.', member, 'active', 2, 'An enquiry is captured', 'Qualified requirement', 'Proposal work can begin', true),
    ('30000000-0000-4000-8000-000000000003', org, '10000000-0000-4000-8000-000000000002', 'Order handoff', 'Move an approved customer commitment into production planning.', member, 'active', 1, 'Customer agreement is signed', 'Planning-ready work order', 'Production scheduling can commit capacity', true),
    ('30000000-0000-4000-8000-000000000004', org, '10000000-0000-4000-8000-000000000002', 'Scheduling', 'Reconcile demand, materials, and available capacity.', member, 'active', 2, 'A work order is ready', 'Committed production slot', 'Delivery receives the build plan', true),
    ('30000000-0000-4000-8000-000000000005', org, '10000000-0000-4000-8000-000000000003', 'Billing', 'Issue an accurate invoice after delivery confirmation.', member, 'active', 1, 'Delivery is confirmed', 'Customer invoice', 'Collections can begin', true)
  on conflict (id) do update set name = excluded.name, description = excluded.description, status = 'active', client_visible = true;

  insert into public.process_steps (id, organization_id, process_id, step_type, name, description, sort_order, owner_membership_id, automation_mode, expected_duration_minutes, actual_duration_minutes, approval_required, decision_criteria, client_visible) values
    ('40000000-0000-4000-8000-000000000001', org, '30000000-0000-4000-8000-000000000003', 'input', 'Receive approved quote and signed terms', 'Commercial sends scope, price, delivery date, and customer requirements.', 1, member, 'manual', 20, null, false, null, true),
    ('40000000-0000-4000-8000-000000000002', org, '30000000-0000-4000-8000-000000000003', 'process', 'Check specifications and capacity', 'Planning reconciles quote details with material availability and the production plan.', 2, member, 'manual', 45, 95, false, null, true),
    ('40000000-0000-4000-8000-000000000003', org, '30000000-0000-4000-8000-000000000003', 'decision', 'Is the order ready to release?', 'Confirm specifications, materials, and promised date.', 3, member, 'manual', 15, null, true, 'Specifications complete, materials identified, and promised date feasible.', true),
    ('40000000-0000-4000-8000-000000000004', org, '30000000-0000-4000-8000-000000000003', 'action', 'Release the work order', 'Resolve exceptions before the job enters the live schedule.', 4, member, 'assisted', 30, null, false, null, true),
    ('40000000-0000-4000-8000-000000000005', org, '30000000-0000-4000-8000-000000000003', 'output', 'Publish planning-ready order', 'A complete order packet becomes the scheduling input.', 5, member, 'assisted', null, null, false, null, true),
    ('40000000-0000-4000-8000-000000000006', org, '30000000-0000-4000-8000-000000000004', 'input', 'Receive planning-ready order', null, 1, member, 'assisted', null, null, false, null, true),
    ('40000000-0000-4000-8000-000000000007', org, '30000000-0000-4000-8000-000000000004', 'decision', 'Can capacity meet the promised date?', null, 2, member, 'manual', null, null, true, 'Material and machine capacity are available.', true),
    ('40000000-0000-4000-8000-000000000008', org, '30000000-0000-4000-8000-000000000004', 'output', 'Commit production slot', null, 3, member, 'assisted', null, null, false, null, true),
    ('40000000-0000-4000-8000-000000000009', org, '30000000-0000-4000-8000-000000000005', 'input', 'Receive delivery confirmation', null, 1, member, 'manual', null, null, false, null, true),
    ('40000000-0000-4000-8000-000000000010', org, '30000000-0000-4000-8000-000000000005', 'process', 'Reconcile order and shipment', null, 2, member, 'manual', null, null, false, null, true),
    ('40000000-0000-4000-8000-000000000011', org, '30000000-0000-4000-8000-000000000005', 'output', 'Issue invoice', null, 3, member, 'assisted', null, null, false, null, true)
  on conflict (id) do update set name = excluded.name, description = excluded.description, client_visible = true;

  insert into public.process_systems (id, organization_id, process_id, system_id, usage_role, client_visible) values
    ('50000000-0000-4000-8000-000000000001', org, '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Approved quote source', true),
    ('50000000-0000-4000-8000-000000000002', org, '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Work-order system of record', true),
    ('50000000-0000-4000-8000-000000000003', org, '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'Production schedule', true),
    ('50000000-0000-4000-8000-000000000004', org, '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'Delivery confirmation source', true)
  on conflict (organization_id, process_id, system_id) do update set usage_role = excluded.usage_role, client_visible = true;

  insert into public.initiatives (id, organization_id, title, objective, status, owner_id, progress, current_phase, next_milestone, client_visible_summary, client_visible) values
    ('60000000-0000-4000-8000-000000000001', org, 'Quote-to-order handoff', 'Reduce delay and ambiguity between commercial approval and production planning.', 'On track', user_id, 58, 'Design', 'Validate the handoff map · 20 Nov', 'Standardize the information required before an approved order enters planning.', true),
    ('60000000-0000-4000-8000-000000000002', org, 'Capacity visibility', 'Give operations a dependable view of committed and available production capacity.', 'At risk', user_id, 31, 'Validation', 'Confirm the source dataset · 24 Nov', 'Establish a trusted capacity view before workflow changes begin.', true)
  on conflict (id) do update set title = excluded.title, objective = excluded.objective, status = excluded.status, progress = excluded.progress, current_phase = excluded.current_phase, next_milestone = excluded.next_milestone, client_visible = true;

  insert into public.process_constraints (id, organization_id, process_id, step_id, system_id, issue_description, severity, frequency, status, client_visible) values
    ('70000000-0000-4000-8000-000000000001', org, '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', null, 'Approved quotes reach planning without a complete specification.', 'high', 'frequent', 'investigating', true),
    ('70000000-0000-4000-8000-000000000002', org, '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', 'Capacity is reconciled manually before a delivery date can be committed.', 'medium', 'frequent', 'planned', true),
    ('70000000-0000-4000-8000-000000000003', org, '30000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000010', null, 'Delivery confirmation reaches Finance after the billing review begins.', 'medium', 'occasional', 'open', true)
  on conflict (id) do update set issue_description = excluded.issue_description, severity = excluded.severity, frequency = excluded.frequency, status = excluded.status, client_visible = true;

  insert into public.constraint_publications (constraint_id, organization_id, root_cause_summary, business_consequence_summary, measured_delay_minutes, initiative_id) values
    ('70000000-0000-4000-8000-000000000001', org, 'Commercial and planning use different completion checklists.', 'Planning pauses while missing details are confirmed, delaying the production slot.', 180, '60000000-0000-4000-8000-000000000001'),
    ('70000000-0000-4000-8000-000000000002', org, 'The current ERP view does not combine committed demand with usable capacity.', 'Delivery commitments require manual reconciliation and additional review.', null, '60000000-0000-4000-8000-000000000002'),
    ('70000000-0000-4000-8000-000000000003', org, 'Delivery and billing confirmation occur in separate records.', 'Invoices can wait for manual confirmation after work is complete.', null, null)
  on conflict (constraint_id) do update set root_cause_summary = excluded.root_cause_summary, business_consequence_summary = excluded.business_consequence_summary, measured_delay_minutes = excluded.measured_delay_minutes, initiative_id = excluded.initiative_id;

  insert into public.initiative_client_narratives (initiative_id, organization_id, current_state_summary, intervention_summary, implementation_summary, expected_result_summary, measurement_plan_summary, client_visible) values
    ('60000000-0000-4000-8000-000000000001', org, 'Planning receives approved work through several records with inconsistent required fields.', 'Define one release-ready order packet and a clear exception path.', 'Validate the handoff, agree required fields, then configure the release workflow.', 'Fewer clarification cycles and a shorter time from signed agreement to committed slot.', 'Compare quote approval and schedule commitment timestamps after the new handoff is in use.', true),
    ('60000000-0000-4000-8000-000000000002', org, 'Capacity is reconciled manually before delivery dates can be confirmed.', 'Establish a trusted capacity dataset and a shared review cadence.', 'Confirm the source of truth, reconcile field definitions, and publish a controlled capacity view.', 'Faster and more consistent delivery-date decisions.', 'Track time to confirm capacity and the share of commitments requiring manual reconciliation.', true)
  on conflict (initiative_id) do update set current_state_summary = excluded.current_state_summary, intervention_summary = excluded.intervention_summary, implementation_summary = excluded.implementation_summary, expected_result_summary = excluded.expected_result_summary, measurement_plan_summary = excluded.measurement_plan_summary, client_visible = true;

  insert into public.measurement_metrics (id, organization_id, initiative_id, process_id, name, description, unit, improvement_direction, source_system_id, measurement_method, cadence, owner_membership_id, confidence_status, client_visible) values
    ('80000000-0000-4000-8000-000000000001', org, '60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Quote-to-schedule time', 'Elapsed time from signed agreement to committed production slot.', 'hours', 'decrease', '20000000-0000-4000-8000-000000000002', 'Compare CRM approval and ERP schedule timestamps.', 'Weekly', member, 'pending', true),
    ('80000000-0000-4000-8000-000000000002', org, '60000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Capacity confirmation time', 'Elapsed time required to confirm a feasible delivery date.', 'hours', 'decrease', '20000000-0000-4000-8000-000000000002', 'Timing sample from capacity review requests.', 'Weekly', member, 'pending', true)
  on conflict (id) do update set name = excluded.name, description = excluded.description, measurement_method = excluded.measurement_method, confidence_status = 'pending', client_visible = true;

  insert into public.metric_baselines (id, organization_id, metric_id, value, period_start, period_end, source_description, verification_status) values
    ('81000000-0000-4000-8000-000000000001', org, '80000000-0000-4000-8000-000000000001', 28, '2026-10-01', '2026-10-31', 'Illustrative timing sample; evidence review pending.', 'pending'),
    ('81000000-0000-4000-8000-000000000002', org, '80000000-0000-4000-8000-000000000002', 6.5, '2026-10-01', '2026-10-31', 'Illustrative timing sample; evidence review pending.', 'pending')
  on conflict (organization_id, metric_id) do update set value = excluded.value, period_start = excluded.period_start, period_end = excluded.period_end, source_description = excluded.source_description, verification_status = 'pending', evidence_id = null, verified_by_membership_id = null, verified_at = null;

  insert into public.metric_targets (id, organization_id, metric_id, value, target_date, rationale, set_by_membership_id) values
    ('82000000-0000-4000-8000-000000000001', org, '80000000-0000-4000-8000-000000000001', 12, '2027-02-28', 'Illustrative target pending client validation.', member),
    ('82000000-0000-4000-8000-000000000002', org, '80000000-0000-4000-8000-000000000002', 2, '2027-02-28', 'Illustrative target pending client validation.', member)
  on conflict (organization_id, metric_id) do update set value = excluded.value, target_date = excluded.target_date, rationale = excluded.rationale;

  -- Withdraw existing demo models before refreshing their published inputs.
  update public.value_models
  set client_visible = false, status = 'draft', aggregation_approved_at = null,
      aggregation_approved_by_membership_id = null
  where organization_id = org and id in (
    '83000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000003'
  );

  insert into public.value_models (id, organization_id, initiative_id, metric_id, name, category, formula_kind, calculation_method, annualization_basis, currency_code, benefit_stream_key, recoverable_percentage, expected_capture_percentage, confidence, confidence_rationale, client_visible, status) values
    ('83000000-0000-4000-8000-000000000001', org, '60000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Order-handling labor capacity', 'labor_savings', 'product', 'Hours saved per order × annual order volume × loaded labor cost', '440 illustrative orders per year', 'USD', 'demo-order-handling-capacity', 80, 75, 'low', 'Illustrative assumptions only; client source evidence remains pending.', false, 'draft'),
    ('83000000-0000-4000-8000-000000000002', org, '60000000-0000-4000-8000-000000000002', null, 'Revenue recovery from faster commitments', 'revenue_recovery', 'product', 'Average recoverable revenue per delayed order × affected orders per year', '27 illustrative delayed orders per year', 'USD', 'demo-revenue-recovery', 80, 75, 'low', 'Illustrative assumptions only; client source evidence remains pending.', false, 'draft'),
    ('83000000-0000-4000-8000-000000000003', org, '60000000-0000-4000-8000-000000000001', null, 'Rework error reduction', 'error_reduction', 'product', 'Average cost per rework event × annual rework events', '70 illustrative rework events per year', 'USD', 'demo-error-reduction', 80, 75, 'low', 'Illustrative assumptions only; client source evidence remains pending.', false, 'draft')
  on conflict (id) do update set name = excluded.name, calculation_method = excluded.calculation_method,
    annualization_basis = excluded.annualization_basis, recoverable_percentage = excluded.recoverable_percentage,
    expected_capture_percentage = excluded.expected_capture_percentage, confidence = excluded.confidence,
    confidence_rationale = excluded.confidence_rationale, client_visible = false, status = 'draft',
    aggregation_approved_at = null, aggregation_approved_by_membership_id = null;

  insert into public.value_model_inputs (id, organization_id, model_id, input_key, label, role, value, unit, origin, source_description, client_visible, sort_order) values
    ('84000000-0000-4000-8000-000000000001', org, '83000000-0000-4000-8000-000000000001', 'hours_per_order', 'Hours saved per order', 'factor', 1.82, 'hours / order', 'delaro_assumption', 'Illustrative workflow assumption; timing evidence pending.', true, 1),
    ('84000000-0000-4000-8000-000000000002', org, '83000000-0000-4000-8000-000000000001', 'orders_per_year', 'Annual order volume', 'factor', 440, 'orders / year', 'client_assumption', 'Illustrative annual volume; client confirmation pending.', true, 2),
    ('84000000-0000-4000-8000-000000000003', org, '83000000-0000-4000-8000-000000000001', 'loaded_labor_cost', 'Loaded labor cost', 'factor', 52, 'USD / hour', 'client_assumption', 'Illustrative loaded cost; client confirmation pending.', true, 3),
    ('84000000-0000-4000-8000-000000000004', org, '83000000-0000-4000-8000-000000000002', 'revenue_per_order', 'Recoverable revenue per delayed order', 'factor', 2875, 'USD / order', 'delaro_assumption', 'Illustrative revenue exposure; transaction evidence pending.', true, 1),
    ('84000000-0000-4000-8000-000000000005', org, '83000000-0000-4000-8000-000000000002', 'affected_orders', 'Affected orders per year', 'factor', 27, 'orders / year', 'client_assumption', 'Illustrative affected volume; client confirmation pending.', true, 2),
    ('84000000-0000-4000-8000-000000000006', org, '83000000-0000-4000-8000-000000000003', 'cost_per_rework', 'Average cost per rework event', 'factor', 420, 'USD / event', 'delaro_assumption', 'Illustrative blended labor and material cost; cost evidence pending.', true, 1),
    ('84000000-0000-4000-8000-000000000007', org, '83000000-0000-4000-8000-000000000003', 'rework_events', 'Annual rework events', 'factor', 70, 'events / year', 'client_assumption', 'Illustrative event frequency; quality records pending.', true, 2)
  on conflict (organization_id, model_id, input_key) do update set label = excluded.label, role = excluded.role,
    value = excluded.value, unit = excluded.unit, origin = excluded.origin,
    source_description = excluded.source_description, client_visible = true, sort_order = excluded.sort_order;

  insert into public.value_evidence (id, organization_id, model_id, source_type, source_reference, description, verification_status, client_visible) values
    ('85000000-0000-4000-8000-000000000001', org, '83000000-0000-4000-8000-000000000001', 'sample', 'Illustrative order-timing sample', 'Replace with ERP transaction history and a post-deployment timing sample.', 'pending', true),
    ('85000000-0000-4000-8000-000000000002', org, '83000000-0000-4000-8000-000000000002', 'client_record', 'Illustrative delayed-order review', 'Replace with order history and confirmed recovery attribution.', 'pending', true),
    ('85000000-0000-4000-8000-000000000003', org, '83000000-0000-4000-8000-000000000003', 'client_record', 'Illustrative quality-cost review', 'Replace with quality events, material cost, and labor records.', 'pending', true)
  on conflict (id) do update set source_reference = excluded.source_reference, description = excluded.description,
    verification_status = 'pending', verified_by_membership_id = null, verified_at = null, client_visible = true;

  update public.value_models
  set client_visible = true, status = 'active', aggregation_approved_at = now(),
      aggregation_approved_by_membership_id = member
  where organization_id = org and id in (
    '83000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000003'
  );

  insert into public.decisions (id, organization_id, process_id, initiative_id, kind, risk_level, title, context, why_needed, recommendation, operational_consequence, requested_from_membership_id, requested_by_membership_id, due_date, status, client_visible) values
    ('90000000-0000-4000-8000-000000000001', org, '30000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000002', 'approval', 'standard', 'Source-system confirmation required', 'Capacity visibility cannot move forward until the source-of-truth dataset is confirmed.', 'The selected source determines the definitions and refresh method used in the capacity view.', 'Use the ERP production schedule as the initial source of truth.', 'Approval allows the data-definition work to proceed; it triggers no automated production action.', member, member, current_date + 5, 'open', true),
    ('90000000-0000-4000-8000-000000000002', org, '30000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', 'question', 'standard', 'Handoff owner confirmation', 'The future-state handoff needs one accountable owner before validation begins.', 'A named owner is required to resolve exceptions and maintain the release checklist.', 'Assign production planning as the accountable owner.', 'Without an owner, incomplete orders may continue to wait between teams.', member, member, current_date + 8, 'open', true)
  on conflict (id) do update set title = excluded.title, context = excluded.context, why_needed = excluded.why_needed, recommendation = excluded.recommendation, due_date = excluded.due_date, status = 'open', client_visible = true;

  insert into public.decision_options (id, organization_id, decision_id, title, description, consequence, is_recommended, client_visible, sort_order) values
    ('91000000-0000-4000-8000-000000000001', org, '90000000-0000-4000-8000-000000000001', 'ERP production schedule', 'Use the controlled production schedule as the initial capacity record.', 'Requires agreed field definitions and a refresh owner.', true, true, 1),
    ('91000000-0000-4000-8000-000000000002', org, '90000000-0000-4000-8000-000000000001', 'Planning workbook', 'Use the current planning workbook during the first validation cycle.', 'Faster to start, but retains a manual reconciliation step.', false, true, 2),
    ('91000000-0000-4000-8000-000000000003', org, '90000000-0000-4000-8000-000000000002', 'Production planning', 'Make production planning accountable for release readiness.', 'Keeps ownership with the team committing capacity.', true, true, 1),
    ('91000000-0000-4000-8000-000000000004', org, '90000000-0000-4000-8000-000000000002', 'Commercial operations', 'Keep accountability with the team approving the customer commitment.', 'May require an additional capacity sign-off.', false, true, 2)
  on conflict (id) do update set title = excluded.title, description = excluded.description, consequence = excluded.consequence, is_recommended = excluded.is_recommended, client_visible = true, sort_order = excluded.sort_order;

  insert into public.decision_events (id, organization_id, decision_id, actor_membership_id, event_type, summary, occurred_at) values
    ('93000000-0000-4000-8000-000000000001', org, '90000000-0000-4000-8000-000000000001', member, 'created', 'Decision requested using illustrative demo data.', now() - interval '2 days'),
    ('93000000-0000-4000-8000-000000000002', org, '90000000-0000-4000-8000-000000000002', member, 'created', 'Ownership question opened using illustrative demo data.', now() - interval '1 day')
  on conflict (id) do update set summary = excluded.summary, occurred_at = excluded.occurred_at;

  insert into public.system_events (id, organization_id, system_id, initiative_id, process_id, decision_id, event_type, severity, summary, status, source, occurred_at, client_visible) values
    ('a0000000-0000-4000-8000-000000000001', org, '20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000001', 'integration_failure', 'warning', 'The latest approved order is not yet visible in the production schedule.', 'needs_attention', 'Illustrative ERP connection', now() - interval '2 hours', true),
    ('a0000000-0000-4000-8000-000000000002', org, '20000000-0000-4000-8000-000000000002', null, '30000000-0000-4000-8000-000000000005', null, 'invoice_review', 'warning', 'An invoice is waiting for delivery confirmation before it can be issued.', 'needs_attention', 'Illustrative billing workflow', now() - interval '5 hours', true),
    ('a0000000-0000-4000-8000-000000000003', org, '20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', null, 'order_sync', 'info', 'An approved order was added to the production schedule.', 'recorded', 'Illustrative order handoff', now() - interval '1 day', true)
  on conflict (id) do update set summary = excluded.summary, status = excluded.status, occurred_at = excluded.occurred_at, client_visible = true;

  insert into public.exceptions (id, organization_id, event_id, decision_id, title, client_summary, status, assigned_to_membership_id, client_visible) values
    ('a1000000-0000-4000-8000-000000000001', org, 'a0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Production schedule needs review', 'Confirm the capacity source before the order synchronization is retried.', 'awaiting_client', member, true),
    ('a1000000-0000-4000-8000-000000000002', org, 'a0000000-0000-4000-8000-000000000002', null, 'Delivery confirmation pending', 'The billing workflow is waiting for a delivery record.', 'investigating', member, true)
  on conflict (id) do update set title = excluded.title, client_summary = excluded.client_summary, status = excluded.status, client_visible = true, resolved_at = null;
end $$;
