import type { InternalOperationalEvent, OperationalActivity, OperationalEvent } from "./types";

const events: OperationalEvent[] = [
  { id: "integration-failure", eventType: "integration_failure", severity: "critical", status: "needs_attention", summary: "The production schedule did not receive the latest approved order. Delaro is investigating the connection.", source: "Order integration", occurredAt: "2026-10-08T13:42:00.000Z", systemName: "Production ERP", initiativeId: "initiative-quote-order", processId: "order-handoff", decisionId: null },
  { id: "invoice-review", eventType: "invoice_review", severity: "warning", status: "needs_attention", summary: "An invoice is waiting for a delivery confirmation before it can be issued.", source: "Billing workflow", occurredAt: "2026-10-08T13:10:00.000Z", systemName: "Production ERP", initiativeId: null, processId: "billing", decisionId: null },
  { id: "sync-complete", eventType: "order_sync", severity: "info", status: "recorded", summary: "An approved order was added to the production schedule.", source: "Order handoff", occurredAt: "2026-10-08T12:35:00.000Z", systemName: "Production ERP", initiativeId: "initiative-quote-order", processId: "order-handoff", decisionId: null },
  { id: "capacity-override", eventType: "manual_override", severity: "warning", status: "needs_attention", summary: "Production capacity was adjusted manually and needs a source-data check.", source: "Production planning", occurredAt: "2026-10-07T15:20:00.000Z", systemName: "Production ERP", initiativeId: "initiative-capacity", processId: "scheduling", decisionId: "source-system" },
  { id: "lead-sla", eventType: "sla_breach", severity: "warning", status: "resolved", summary: "A lead waited longer than the agreed response window; the routing issue has been resolved.", source: "Lead routing", occurredAt: "2026-10-06T10:05:00.000Z", systemName: "Customer CRM", initiativeId: null, processId: "lead-intake", decisionId: null },
  { id: "approval-done", eventType: "approval_completed", severity: "info", status: "recorded", summary: "The next quote-to-order handoff step was approved.", source: "Shared decision", occurredAt: "2026-10-05T16:45:00.000Z", systemName: null, initiativeId: "initiative-quote-order", processId: "order-handoff", decisionId: null },
  { id: "measure-update", eventType: "measurement_updated", severity: "info", status: "recorded", summary: "The handoff measurement plan changed. No new result has been verified.", source: "Measurement plan", occurredAt: "2026-10-04T11:30:00.000Z", systemName: null, initiativeId: "initiative-quote-order", processId: "order-handoff", decisionId: null },
];

export const demoOperationalActivity: OperationalActivity = {
  events,
  exceptions: [
    { id: "integration-exception", eventId: "integration-failure", title: "Order connection interrupted", summary: "An approved order did not reach production planning. Delaro is checking the connection and the missing order.", status: "investigating", severity: "critical", occurredAt: "2026-10-08T13:42:00.000Z", decisionId: null },
    { id: "invoice-exception", eventId: "invoice-review", title: "Invoice needs delivery confirmation", summary: "Finance is checking the delivery record before issuing this invoice.", status: "investigating", severity: "warning", occurredAt: "2026-10-08T13:10:00.000Z", decisionId: null },
    { id: "capacity-exception", eventId: "capacity-override", title: "Capacity source needs confirmation", summary: "The planning adjustment needs to be reconciled with the agreed source of truth.", status: "awaiting_client", severity: "warning", occurredAt: "2026-10-07T15:20:00.000Z", decisionId: "source-system" },
  ],
  demo: true,
};

export const demoInternalEvents: InternalOperationalEvent[] = events.map((event) => ({
  ...event, sourceReference: null, technicalDetails: null, metadata: {},
}));
