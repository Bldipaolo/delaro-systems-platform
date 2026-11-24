import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

export const maxWorkflowEventBytes = 32 * 1024;

const optionalTimestamp = z.string().datetime({ offset: true }).nullable().optional();

export const workflowEventSchema = z.object({
  eventId: z.string().trim().min(1).max(180),
  executionId: z.string().trim().min(1).max(180),
  eventType: z.enum(["started", "completed", "failed", "observed"]),
  status: z.enum(["running", "successful", "failed", "unknown"]),
  occurredAt: z.string().datetime({ offset: true }),
  startedAt: optionalTimestamp,
  finishedAt: optionalTimestamp,
  durationMs: z.number().int().min(0).max(31_536_000_000).nullable().optional(),
  errorCode: z.string().trim().regex(/^[A-Za-z0-9_.-]+$/).max(100).nullable().optional(),
  errorSummary: z.string().trim().max(500).nullable().optional(),
  source: z.enum(["n8n_workflow_reporter", "n8n_error_trigger", "n8n_api_poll"]),
}).strict().superRefine((event, context) => {
  const expected = event.eventType === "completed" ? "successful" : event.eventType === "failed" ? "failed" : null;
  if (expected && event.status !== expected) context.addIssue({ code: "custom", path: ["status"], message: `${event.eventType} events must report ${expected}.` });
  if (event.eventType === "started" && !["running", "unknown"].includes(event.status)) context.addIssue({ code: "custom", path: ["status"], message: "Started events must be running or unknown." });
  if (event.status === "successful" && (event.errorCode || event.errorSummary)) context.addIssue({ code: "custom", path: ["errorSummary"], message: "Successful events cannot include an error." });
  if (event.startedAt && event.finishedAt && Date.parse(event.finishedAt) < Date.parse(event.startedAt)) context.addIssue({ code: "custom", path: ["finishedAt"], message: "Finish time cannot precede start time." });
});

export type WorkflowEventInput = z.infer<typeof workflowEventSchema>;

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sanitizeErrorSummary(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[credential redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/([?&](?:token|key|secret|password|signature)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[url redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[network address redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || null;
}

export function parseIntegrationToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer delaro_n8n_([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,128})$/i);
  if (!match) return null;
  return { credentialId: match[1].toLowerCase(), secretHash: sha256(match[2]) };
}

export function createIntegrationToken() {
  const credentialId = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  return {
    credentialId,
    secretHash: sha256(secret),
    tokenHint: secret.slice(-8),
    token: `delaro_n8n_${credentialId}.${secret}`,
  };
}
