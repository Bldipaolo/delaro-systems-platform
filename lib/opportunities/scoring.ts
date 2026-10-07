import type { OpportunityPriority } from "@/lib/domain";

export type OpportunityScoreInputs = {
  financialImpact: number;
  frequency: number;
  addressability: number;
  measurementQuality: number;
  strategicLeverage: number;
  implementationDifficulty: number;
  organizationalComplexity: number;
  risk: number;
};

export function calculateOpportunityScore(inputs: OpportunityScoreInputs): number {
  return inputs.financialImpact + inputs.frequency + inputs.addressability + inputs.measurementQuality + inputs.strategicLeverage - inputs.implementationDifficulty - inputs.organizationalComplexity - inputs.risk;
}

export function priorityForScore(score: number): OpportunityPriority {
  if (score >= 24) return "Critical";
  if (score >= 16) return "High";
  if (score >= 8) return "Medium";
  return "Low";
}
