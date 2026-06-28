// =============================================================================
//  AI TELEMETRY — COST CALCULATOR
//  ai/telemetry/costCalculator.ts
//
//  Design Decisions:
//  - Keeps cost calculations out of the logger and provider, making prices
//    easy to adjust without touching orchestration logic.
//  - Tracks pricing per million tokens in USD.
//  - Falls back to general defaults if model name is unrecognized.
// =============================================================================

import type { TokenUsage } from "../provider/types";

interface ModelPricing {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

/**
 * Public rates as of current version.
 * Priced in USD per 1,000,000 tokens.
 */
const PRICING_REGISTRY: Readonly<Record<string, ModelPricing>> = {
  // Gemini 2.0 Flash
  "gemini-2.0-flash": { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  // Gemini 2.5 Pro
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.00 },
  // General fallback rates
  "default": { inputPerMillion: 0.15, outputPerMillion: 0.60 },
} as const;

/**
 * Calculate the estimated USD cost of an execution.
 */
export function calculateCost(modelName: string, usage?: TokenUsage): number {
  if (!usage) return 0;

  const normalizedModel = modelName.toLowerCase();
  const rates = PRICING_REGISTRY[normalizedModel] || PRICING_REGISTRY["default"];

  const inputCost = (usage.inputTokens / 1_000_000) * rates.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * rates.outputPerMillion;

  // Round to 6 decimal places to handle micro-cents cleanly
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
