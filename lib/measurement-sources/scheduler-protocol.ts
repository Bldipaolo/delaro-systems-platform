import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isValidCronAuthorization(authorization: string | null, secret: string | undefined) {
  if (!authorization || !secret || secret.length < 24) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

export function sanitizeSyncError(value: unknown) {
  const message = value instanceof Error ? value.message : "Provider synchronization failed.";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:access_token|api_key|token|secret)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 500);
}
