import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateMetricObservation } from "@/lib/operational-intelligence/evaluator";
import { maxMetricObservationBytes, metricObservationSchema, metricSha256, parseMetricIntegrationToken } from "@/lib/measurement/ingestion";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxMetricObservationBytes) return response({ accepted: false, error: "Payload is too large." }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return response({ accepted: false, error: "Content-Type must be application/json." }, 415);
  const token = parseMetricIntegrationToken(request.headers.get("authorization"));
  if (!token) return response({ accepted: false, error: "Invalid metric reporting credential." }, 401);

  let rawBody: string;
  try { rawBody = await request.text(); } catch { return response({ accepted: false, error: "Unable to read request body." }, 400); }
  if (new TextEncoder().encode(rawBody).byteLength > maxMetricObservationBytes) return response({ accepted: false, error: "Payload is too large." }, 413);
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return response({ accepted: false, error: "Malformed JSON." }, 400); }
  const parsed = metricObservationSchema.safeParse(json);
  if (!parsed.success) return response({ accepted: false, error: "Invalid metric observation.", fields: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean) }, 400);
  const observation = parsed.data;

  const { data, error } = await createAdminClient().rpc("ingest_metric_observation", {
    target_credential_id: token.credentialId,
    supplied_secret_hash: token.secretHash,
    external_event_key: observation.eventId,
    reported_value: observation.value,
    reported_unit: observation.unit,
    reported_measured_at: observation.measuredAt,
    reported_period_start: observation.periodStart ?? null,
    reported_period_end: observation.periodEnd ?? null,
    reported_sample_size: observation.sampleSize ?? null,
    reported_aggregation_method: observation.aggregation ?? null,
    reported_source_reference: observation.sourceReference ?? null,
    reported_source: observation.source,
    reported_payload_digest: metricSha256(rawBody),
  });
  if (error) {
    if (error.code === "42501") return response({ accepted: false, error: "Invalid metric reporting credential." }, 401);
    if (error.code === "54000") return response({ accepted: false, error: "Metric reporting rate limit exceeded. Retry after one minute." }, 429);
    if (error.code?.startsWith("22") || error.code === "23514") return response({ accepted: false, error: "Invalid metric observation." }, 400);
    return response({ accepted: false, error: "Metric observation could not be recorded." }, 503);
  }
  const result = data as { duplicate?: boolean; observation_id?: string | null } | null;
  if (!result?.duplicate && result?.observation_id) {
    try {
      await evaluateMetricObservation(result.observation_id);
    } catch {
      console.error("Operational intelligence evaluation failed after metric ingestion.");
    }
  }
  return response({ accepted: true, duplicate: Boolean(result?.duplicate) }, result?.duplicate ? 200 : 202);
}
