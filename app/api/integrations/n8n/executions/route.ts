import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateWorkflowExecution } from "@/lib/operational-intelligence/evaluator";
import { maxWorkflowEventBytes, parseIntegrationToken, sanitizeErrorSummary, sha256, workflowEventSchema } from "@/lib/workflow-observability/protocol";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxWorkflowEventBytes) return response({ accepted: false, error: "Payload is too large." }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return response({ accepted: false, error: "Content-Type must be application/json." }, 415);
  const token = parseIntegrationToken(request.headers.get("authorization"));
  if (!token) return response({ accepted: false, error: "Invalid integration credential." }, 401);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return response({ accepted: false, error: "Unable to read request body." }, 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > maxWorkflowEventBytes) return response({ accepted: false, error: "Payload is too large." }, 413);

  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return response({ accepted: false, error: "Malformed JSON." }, 400); }
  const parsed = workflowEventSchema.safeParse(json);
  if (!parsed.success) return response({ accepted: false, error: "Invalid execution event.", fields: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean) }, 400);
  const event = parsed.data;

  const { data, error } = await createAdminClient().rpc("ingest_n8n_execution_event", {
    target_credential_id: token.credentialId,
    supplied_secret_hash: token.secretHash,
    external_event_key: event.eventId,
    external_execution_key: event.executionId,
    reported_event_type: event.eventType,
    reported_status: event.status,
    reported_occurred_at: event.occurredAt,
    reported_started_at: event.startedAt ?? null,
    reported_finished_at: event.finishedAt ?? null,
    reported_duration_ms: event.durationMs ?? null,
    reported_error_code: event.errorCode || null,
    reported_error_summary: sanitizeErrorSummary(event.errorSummary),
    reported_source: event.source,
    reported_payload_digest: sha256(rawBody),
  });
  if (error) {
    if (error.code === "42501") return response({ accepted: false, error: "Invalid integration credential." }, 401);
    if (error.code === "54000") return response({ accepted: false, error: "Workflow event rate limit exceeded. Retry after one minute." }, 429);
    if (error.code?.startsWith("22")) return response({ accepted: false, error: "Invalid execution event." }, 400);
    return response({ accepted: false, error: "Execution event could not be recorded." }, 503);
  }
  const result = data as { accepted?: boolean; duplicate?: boolean; execution_id?: string | null } | null;
  if (!result?.duplicate && result?.execution_id) {
    try {
      await evaluateWorkflowExecution(result.execution_id);
    } catch {
      console.error("Operational intelligence evaluation failed after workflow ingestion.");
    }
  }
  return response({ accepted: true, duplicate: Boolean(result?.duplicate) }, result?.duplicate ? 200 : 202);
}
