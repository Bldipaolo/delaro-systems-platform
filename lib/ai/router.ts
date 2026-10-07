import { z } from "zod";

export const aiTaskTypes = ["extract", "classify", "normalize", "summarize", "diagnose", "recommend", "write_executive_summary"] as const;
export type AiTaskType = (typeof aiTaskTypes)[number];

const taskSchema = z.object({
  taskType: z.enum(aiTaskTypes),
  organizationId: z.string().uuid(),
  input: z.unknown(),
});

export type AiTaskRequest = z.infer<typeof taskSchema>;

/**
 * Central routing seam for future internal AI capabilities.
 * Business-critical calculations and permission decisions must not call this layer.
 */
export function validateAiTask(request: AiTaskRequest): AiTaskRequest {
  return taskSchema.parse(request);
}

export function modelTierForTask(taskType: AiTaskType): "cheap" | "primary" | "premium-escalation" {
  if (["extract", "classify", "normalize", "summarize"].includes(taskType)) return "cheap";
  if (["diagnose", "recommend", "write_executive_summary"].includes(taskType)) return "primary";
  return "premium-escalation";
}
