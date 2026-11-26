import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decodeMeasurementSourceKey,
  decryptMeasurementSourceSecret,
  encryptMeasurementSourceSecret,
} from "@/lib/measurement-sources/secret-crypto";

const HUBSPOT_SECRET_TYPE = "hubspot_service_key";

function encryptionKey() {
  return decodeMeasurementSourceKey(process.env.MEASUREMENT_SOURCE_ENCRYPTION_KEY ?? "");
}

export async function storeHubSpotSourceSecret(sourceId: string, organizationId: string, accessToken: string) {
  const encrypted = encryptMeasurementSourceSecret(accessToken, encryptionKey(), {
    sourceId,
    organizationId,
    secretType: HUBSPOT_SECRET_TYPE,
  });
  const client = createAdminClient();
  const { error } = await client.rpc("store_measurement_source_secret", {
    target_source_id: sourceId,
    target_organization_id: organizationId,
    target_secret_type: HUBSPOT_SECRET_TYPE,
    target_encrypted_payload: encrypted.encryptedPayload,
    target_encryption_iv: encrypted.encryptionIv,
    target_encryption_tag: encrypted.encryptionTag,
    target_key_version: encrypted.keyVersion,
  });
  if (error) throw new Error("The provider credential could not be stored securely.");
}

export async function readHubSpotSourceSecret(sourceId: string, expectedOrganizationId: string) {
  const client = createAdminClient();
  const { data, error } = await client.rpc("read_measurement_source_secret", { target_source_id: sourceId });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row || row.organization_id !== expectedOrganizationId || row.secret_type !== HUBSPOT_SECRET_TYPE) {
    throw new Error("The HubSpot credential is unavailable for this source.");
  }
  return decryptMeasurementSourceSecret({
    encryptedPayload: row.encrypted_payload,
    encryptionIv: row.encryption_iv,
    encryptionTag: row.encryption_tag,
    keyVersion: row.key_version,
  }, encryptionKey(), {
    sourceId,
    organizationId: expectedOrganizationId,
    secretType: HUBSPOT_SECRET_TYPE,
  });
}

export async function deleteMeasurementSourceSecret(sourceId: string) {
  const client = createAdminClient();
  const { error } = await client.rpc("delete_measurement_source_secret", { target_source_id: sourceId });
  if (error) throw new Error("The provider credential could not be revoked.");
}
