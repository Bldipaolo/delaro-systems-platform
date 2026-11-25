import type { ImprovementDirection } from "@/lib/measurement/types";

export type ImprovementResult = { absolute: number; percentage: number | null; favorable: boolean };

export function calculateImprovement(baseline: number, current: number, direction: ImprovementDirection, target?: number | null): ImprovementResult {
  const raw = current - baseline;
  const absolute = direction === "decrease" ? -raw : direction === "increase" ? raw : -(Math.abs(current - (target ?? baseline)) - Math.abs(baseline - (target ?? baseline)));
  const denominator = direction === "target" ? Math.abs(baseline - (target ?? baseline)) : Math.abs(baseline);
  return { absolute, percentage: denominator === 0 ? null : absolute / denominator, favorable: absolute > 0 };
}
