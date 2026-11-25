-- Explicitly document the service-only boundary. The ingestion SECURITY
-- DEFINER function owns these counters; authenticated users receive no rows.
create policy "Authenticated users cannot access metric rate windows"
  on public.metric_ingestion_rate_windows
  for all to authenticated
  using (false)
  with check (false);
