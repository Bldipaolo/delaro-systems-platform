-- Automatic client publication is reserved for direct infrastructure-health
-- facts. Interpretive metric and workflow signals require human review.
alter table public.operational_signal_rules
  add constraint operational_signal_rules_auto_publication_check check (
    client_publication_mode <> 'auto_publish'
    or (entity_type='measurement_source' and detection_method='source_health')
  );

alter table public.operational_signals
  add constraint operational_signals_auto_publication_check check (
    publication_reason is distinct from 'automatic_infrastructure'
    or (entity_type='measurement_source' and signal_type in ('source_stale','source_degraded','source_sync_failures'))
  );
