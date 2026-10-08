export type EventSeverity = "info" | "warning" | "critical";
export type EventStatus = "recorded" | "needs_attention" | "resolved";
export type ExceptionStatus = "open" | "investigating" | "awaiting_client" | "resolved" | "dismissed";

export type OperationalEvent = {
  id: string;
  eventType: string;
  severity: EventSeverity;
  summary: string;
  status: EventStatus;
  source: string;
  occurredAt: string;
  systemName: string | null;
  initiativeId: string | null;
  processId: string | null;
  decisionId: string | null;
};

export type OperationalException = {
  id: string;
  eventId: string;
  title: string;
  summary: string;
  status: ExceptionStatus;
  severity: EventSeverity;
  occurredAt: string;
  decisionId: string | null;
};

export type OperationalActivity = {
  events: OperationalEvent[];
  exceptions: OperationalException[];
  demo: boolean;
};

export type InternalOperationalEvent = OperationalEvent & {
  sourceReference: string | null;
  technicalDetails: string | null;
  metadata: Record<string, unknown>;
};
