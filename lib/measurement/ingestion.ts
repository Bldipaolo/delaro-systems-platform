import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

export const maxMetricObservationBytes = 16 * 1024;

export const metricObservationSchema = z.object({
  eventId: z.string().trim().min(1).max(180),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(40),
  measuredAt: z.string().datetime({ offset: true }),
  periodStart: z.string().date().nullable().optional(),
  periodEnd: z.string().date().nullable().optional(),
  sampleSize: z.number().int().positive().max(1_000_000_000).nullable().optional(),
  aggregation: z.string().trim().max(160).nullable().optional(),
  sourceReference: z.string().trim().max(500).nullable().optional(),
  source: z.enum(["n8n_metric_reporter", "api_metric_reporter"]),
}).strict().superRefine((observation, context) => {
  if (observation.periodStart && observation.periodEnd && observation.periodEnd < observation.periodStart) {
    context.addIssue({ code: "custom", path: ["periodEnd"], message: "Period end cannot precede period start." });
  }
});

export function metricSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseMetricIntegrationToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer delaro_metric_([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,128})$/i);
  if (!match) return null;
  return { credentialId: match[1].toLowerCase(), secretHash: metricSha256(match[2]) };
}

export function createMetricIntegrationToken() {
  const credentialId = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  return {
    credentialId,
    secretHash: metricSha256(secret),
    tokenHint: secret.slice(-8),
    token: `delaro_metric_${credentialId}.${secret}`,
  };
}
