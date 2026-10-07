import { z } from "zod";

const boundedScore = z.number().int().min(0).max(5);

export const opportunityInputSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  process: z.string().trim().min(2).max(120),
  currentStateProblem: z.string().trim().min(10).max(4000),
  rootCause: z.string().trim().max(4000).optional(),
  businessConsequence: z.string().trim().min(10).max(4000),
  estimatedAnnualValue: z.number().nonnegative().nullable(),
  financialImpact: boundedScore,
  frequency: boundedScore,
  addressability: boundedScore,
  measurementQuality: boundedScore,
  strategicLeverage: boundedScore,
  implementationDifficulty: boundedScore,
  organizationalComplexity: boundedScore,
  risk: boundedScore,
  evidenceQuality: z.enum(["Low", "Medium", "High"]),
  status: z.enum(["Investigate", "Qualified", "Prioritized", "Proposed", "Approved", "Implementing", "Measuring", "Complete", "Rejected"]),
  ownerId: z.string().uuid().nullable(),
  nextAction: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(10000).optional(),
  clientVisibleSummary: z.string().trim().max(4000).optional(),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;
