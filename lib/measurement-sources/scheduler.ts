import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSyncError } from "@/lib/measurement-sources/scheduler-protocol";
import { normalizeProviderRecords, sourcePayloadDigest } from "@/lib/measurement-sources/normalization";
import { readHubSpotSourceSecret } from "@/lib/measurement-sources/secrets";
import {
  assertHubSpotObjectType,
  fetchHubSpotRecords,
  hubSpotPropertiesForMappings,
  type HubSpotObjectType,
} from "@/lib/measurement-sources/providers/hubspot";
import type { MeasurementSourceMapping } from "@/lib/measurement-sources/types";

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

type StoredMapping = MeasurementSourceMapping & {
  providerObject: HubSpotObjectType;
};

async function loadHubSpotSource(claim: ClaimedSyncRun) {
  const client = createAdminClient();
  const [{ data: source, error: sourceError }, { data: rows, error: mappingError }] = await Promise.all([
    client.from("measurement_sources").select("id,organization_id,provider_type,status")
      .eq("id", claim.source_id).eq("organization_id", claim.organization_id).maybeSingle(),
    client.from("measurement_source_mappings")
      .select("id,provider_object,value_field,timestamp_field,external_id_field,transform_kind,scale_factor,offset_value,aggregation_method,period_granularity")
      .eq("source_id", claim.source_id).eq("organization_id", claim.organization_id).eq("status", "active"),
  ]);
  if (sourceError || !source || source.provider_type !== "hubspot") throw new Error("The claimed HubSpot source is unavailable.");
  if (mappingError) throw new Error("The source mappings could not be loaded.");
  const mappings: StoredMapping[] = (rows ?? []).map((row) => ({
    id: row.id,
    providerObject: assertHubSpotObjectType(row.provider_object),
    valueField: row.value_field,
    timestampField: row.timestamp_field,
    externalIdField: row.external_id_field,
    transformKind: row.transform_kind,
    scaleFactor: Number(row.scale_factor),
    offsetValue: Number(row.offset_value),
    aggregationMethod: row.aggregation_method,
    periodGranularity: row.period_granularity,
  }));
  if (!mappings.length) throw new Error("At least one active metric mapping is required before synchronization.");
  return { client, mappings };
}

async function executeHubSpotSource(claim: ClaimedSyncRun): Promise<SourceSyncResult> {
  const { client, mappings } = await loadHubSpotSource(claim);
  const accessToken = await readHubSpotSourceSecret(claim.source_id, claim.organization_id);
  const byObject = new Map<HubSpotObjectType, StoredMapping[]>();
  for (const mapping of mappings) byObject.set(mapping.providerObject, [...(byObject.get(mapping.providerObject) ?? []), mapping]);

  let recordsSeen = 0;
  let recordsAccepted = 0;
  let recordsDuplicate = 0;
  let recordsFailed = 0;
  let lastRecordAt: string | null = null;
  const cursors: string[] = [];

  for (const [objectType, objectMappings] of byObject) {
    const fetched = await fetchHubSpotRecords(accessToken, objectType, hubSpotPropertiesForMappings(objectMappings));
    recordsSeen += fetched.records.length;
    if (fetched.cursor) cursors.push(`${objectType}:${fetched.cursor}`);
    for (const mapping of objectMappings) {
      let observations;
      try {
        observations = normalizeProviderRecords(fetched.records, mapping);
      } catch {
        recordsFailed += 1;
        continue;
      }
      for (const observation of observations) {
        const digest = sourcePayloadDigest({
          sourceId: claim.source_id,
          mappingId: mapping.id,
          sourceRecordId: observation.sourceRecordId,
          measuredAt: observation.measuredAt,
          value: observation.rawValue,
        });
        const { data, error } = await client.rpc("ingest_mapped_metric_observation", {
          target_source_id: claim.source_id,
          target_mapping_id: mapping.id,
          external_record_key: observation.sourceRecordId,
          reported_value: observation.rawValue,
          reported_measured_at: observation.measuredAt,
          reported_period_start: observation.periodStart,
          reported_period_end: observation.periodEnd,
          reported_sample_size: observation.sampleSize,
          reported_source_reference: observation.sourceReference,
          reported_source_updated_at: observation.sourceUpdatedAt,
          reported_payload_digest: digest,
        });
        if (error) {
          recordsFailed += 1;
          continue;
        }
        const result = data as { duplicate?: boolean } | null;
        if (result?.duplicate) recordsDuplicate += 1;
        else recordsAccepted += 1;
        if (!lastRecordAt || observation.measuredAt > lastRecordAt) lastRecordAt = observation.measuredAt;
      }
    }
  }

  return {
    status: recordsFailed > 0 ? (recordsAccepted + recordsDuplicate > 0 ? "partial" : "failed") : "succeeded",
    recordsSeen,
    recordsAccepted,
    recordsDuplicate,
    recordsFailed,
    cursorReference: cursors.join(",").slice(0, 500) || null,
    errorCode: recordsFailed > 0 ? "RECORD_NORMALIZATION_FAILED" : null,
    errorSummary: recordsFailed > 0 ? `${recordsFailed} mapped observation${recordsFailed === 1 ? "" : "s"} could not be normalized or stored.` : null,
    lastRecordAt,
  };
}

export async function executeClaimedSource(claim: ClaimedSyncRun): Promise<SourceSyncResult> {
  if (claim.provider_type === "hubspot") return executeHubSpotSource(claim);
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
