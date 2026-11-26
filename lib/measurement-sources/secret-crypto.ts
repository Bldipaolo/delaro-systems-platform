import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedMeasurementSecret = {
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
  keyVersion: number;
};

function aad(sourceId: string, organizationId: string, secretType: string, keyVersion: number) {
  return Buffer.from(`delaro:measurement-source:v${keyVersion}:${organizationId}:${sourceId}:${secretType}`, "utf8");
}

export function decodeMeasurementSourceKey(encoded: string): Buffer {
  const trimmed = encoded.trim();
  if (!trimmed) throw new Error("Measurement source encryption is not configured.");
  const key = Buffer.from(trimmed, "base64url");
  if (key.length !== 32) throw new Error("Measurement source encryption key must contain exactly 32 bytes.");
  return key;
}

export function encryptMeasurementSourceSecret(
  plaintext: string,
  key: Buffer,
  context: { sourceId: string; organizationId: string; secretType: string; keyVersion?: number },
): EncryptedMeasurementSecret {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  if (!plaintext) throw new Error("A provider credential is required.");
  const keyVersion = context.keyVersion ?? 1;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context.sourceId, context.organizationId, context.secretType, keyVersion));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString("base64url"),
    encryptionIv: iv.toString("base64url"),
    encryptionTag: cipher.getAuthTag().toString("base64url"),
    keyVersion,
  };
}

export function decryptMeasurementSourceSecret(
  encrypted: EncryptedMeasurementSecret,
  key: Buffer,
  context: { sourceId: string; organizationId: string; secretType: string },
) {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.encryptionIv, "base64url"));
  decipher.setAAD(aad(context.sourceId, context.organizationId, context.secretType, encrypted.keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.encryptionTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedPayload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
