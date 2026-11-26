import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSyncError } from "@/lib/measurement-sources/scheduler-protocol";

export type ClaimedSyncRun = {
  run_id: string;
  organization_id: string;
  source_id: string;
  provider_type: string;
  attempt: number;
};

export type SourceSyncResult = {
  status: "succeeded" | "partial" | "failed" | "cancelled";
  recordsSeen: number;
  recordsAccepted: number;
  recordsDuplicate: number;
  recordsFailed: number;
  cursorReference?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
  lastRecordAt?: string | null;
};

export async function executeClaimedSource(claim: ClaimedSyncRun): Promise<SourceSyncResult> {
  return {
    status: "failed",
    recordsSeen: 0,
    recordsAccepted: 0,
    recordsDuplicate: 0,
    recordsFailed: 0,
    errorCode: "ADAPTER_UNAVAILABLE",
    errorSummary: `No pull adapter is enabled for ${claim.provider_type}.`,
  };
}

export async function runScheduledMeasurementSyncs(
  executor: (claim: ClaimedSyncRun) => Promise<SourceSyncResult> = executeClaimedSource,
  maximumRuns = 5,
) {
  const client = createAdminClient();
  await client.rpc("refresh_measurement_source_health");
  const { data, error } = await client.rpc("claim_due_measurement_sync_runs", { maximum_runs: maximumRuns });
  if (error) throw new Error(`Unable to claim measurement sync work: ${error.code ?? "unknown"}`);
  const claims = (data ?? []) as ClaimedSyncRun[];
  const outcomes: Array<{ runId: string; status: SourceSyncResult["status"] }> = [];
  for (const claim of claims) {
    let result: SourceSyncResult;
    try {
      result = await executor(claim);
    } catch (cause) {
      result = {
        status: "failed", recordsSeen: 0, recordsAccepted: 0,
        recordsDuplicate: 0, recordsFailed: 0, errorCode: "PROVIDER_ERROR",
        errorSummary: sanitizeSyncError(cause),
      };
    }
    const { error: completionError } = await client.rpc("complete_measurement_sync_run", {
      target_run_id: claim.run_id,
      final_status: result.status,
      reported_records_seen: result.recordsSeen,
      reported_records_accepted: result.recordsAccepted,
      reported_records_duplicate: result.recordsDuplicate,
      reported_records_failed: result.recordsFailed,
      reported_cursor_reference: result.cursorReference ?? "",
      reported_error_code: result.errorCode ?? "",
      reported_error_summary: result.errorSummary ?? "",
      reported_last_record_at: result.lastRecordAt ?? null,
    });
    if (completionError) throw new Error(`Unable to complete measurement sync work: ${completionError.code ?? "unknown"}`);
    outcomes.push({ runId: claim.run_id, status: result.status });
  }
  return outcomes;
}
