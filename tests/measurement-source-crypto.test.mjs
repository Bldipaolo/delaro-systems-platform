import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeMeasurementSourceKey,
  decryptMeasurementSourceSecret,
  encryptMeasurementSourceSecret,
} from "../lib/measurement-sources/secret-crypto.ts";

const context = {
  sourceId: "e4030000-0000-4000-8000-000000000001",
  organizationId: "e4000000-0000-4000-8000-000000000001",
  secretType: "hubspot_service_key",
};

test("measurement source credentials are encrypted with authenticated context", () => {
  const key = decodeMeasurementSourceKey(Buffer.alloc(32, 7).toString("base64url"));
  const encrypted = encryptMeasurementSourceSecret("pat-na1-secret-fixture", key, context);
  assert.equal(encrypted.encryptedPayload.includes("secret-fixture"), false);
  assert.equal(decryptMeasurementSourceSecret(encrypted, key, context), "pat-na1-secret-fixture");
  assert.throws(() => decryptMeasurementSourceSecret(encrypted, key, { ...context, organizationId: crypto.randomUUID() }));
});

test("measurement source credential tampering and invalid keys fail closed", () => {
  const key = Buffer.alloc(32, 11);
  const encrypted = encryptMeasurementSourceSecret("fixture-service-key", key, context);
  assert.throws(() => decryptMeasurementSourceSecret({ ...encrypted, encryptedPayload: `${encrypted.encryptedPayload}x` }, key, context));
  assert.throws(() => decryptMeasurementSourceSecret(encrypted, Buffer.alloc(32, 12), context));
  assert.throws(() => decodeMeasurementSourceKey(Buffer.alloc(16).toString("base64url")), /32 bytes/);
});
