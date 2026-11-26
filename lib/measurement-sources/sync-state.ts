import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type MeasurementSourceCursorState = Record<string, string>;

function safeCursorState(value: unknown): MeasurementSourceCursorState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, cursor]) => /^[a-z_]{1,40}$/.test(key) && typeof cursor === "string" && cursor.length <= 300));
}

export async function readMeasurementSourceSyncState(sourceId: string, expectedOrganizationId: string) {
  const client = createAdminClient();
  const { data, error } = await client.rpc("read_measurement_source_sync_state", { target_source_id: sourceId });
  const row = Array.isArray(data) ? data[0] : null;
  if (error) throw new Error("Measurement source cursor state is unavailable.");
  if (!row) return {};
  if (row.organization_id !== expectedOrganizationId) throw new Error("Measurement source cursor tenant mismatch.");
  return safeCursorState(row.cursor_state);
}

export async function storeMeasurementSourceSyncState(
  sourceId: string,
  organizationId: string,
  cursorState: MeasurementSourceCursorState,
) {
  const client = createAdminClient();
  const { error } = await client.rpc("store_measurement_source_sync_state", {
    target_source_id: sourceId,
    target_organization_id: organizationId,
    target_cursor_state: safeCursorState(cursorState),
  });
  if (error) throw new Error("Measurement source cursor state could not be saved.");
}
