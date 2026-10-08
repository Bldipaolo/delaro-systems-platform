# Delaro internal workspace

The internal navigation follows the consulting workflow: Portfolio and Clients; Diagnose (Operations, Constraints, Opportunities, Business cases); Deliver (Improvements, Exceptions); Measure (Metrics, Evidence, Value realization).

Only routes with existing supporting records are linked. Architecture and Deployments are not yet backed by deployment/architecture records. Reviews remain a client check-in record at `/reviews`; no internal review queue exists, so the internal sidebar does not link the client route as if it were protected internal work.

Operations reads the tenant-scoped operating model and allows Delaro roles to update process and system status. Constraints show diagnosed friction, root cause, consequence, and opportunity linkage. Business cases combine value models with the opportunity's implementation-cost estimate; payback is calculated only when expected annual value and cost are both recorded. Value realization separates estimates from evidence-backed verified snapshots. Metrics and Evidence show all internal measurement records, including pending material. Evidence review is an explicit Delaro action and is not available in demo mode.

The `(delaro)` layout rejects client roles server-side. Internal data loaders resolve the active organization from authenticated memberships, and write actions filter by that organization and record ID. RLS remains the database boundary. Without Supabase configuration, views use explicitly labeled Northstar demo examples and editing is disabled.
