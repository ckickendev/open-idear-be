/**
 * ai/config/models.ts
 *
 * Centralized model alias registry.
 * Maps semantic capability names to actual Gemini model identifiers.
 *
 * Update only this map when Google releases new model versions.
 * All agents, workflows, and the GeminiProvider import aliases from here.
 */

export const MODEL_ALIASES = {
  /** High-throughput, low-latency: most steps in the system */
  fast: "gemini-3.5-flash-lite",
  /** Best reasoning: SEO scoring, quality review, article writing */
  quality: "gemini-3.5-flash",
  /** Multimodal: analyzeImage.step, OCR, vision tasks */
  vision: "gemini-3.5-flash",
  /** Default fallback when no alias is specified */
  default: "gemini-3.5-flash-lite",
} as const;

export const MODEL_FALLBACK_CHAIN: Readonly<Record<string, readonly string[]>> = {
  "gemini-3.5-flash-lite": ["gemini-3-flash-preview", "gemini-3.5-flash", "gemini-2.5-flash"],
  "gemini-3.5-flash": ["gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"],
  "gemini-3-flash-preview": ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"],
  "gemini-2.5-flash": ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3-flash-preview"],
} as const;

/**
 * Resolves a semantic alias (e.g., "fast") to an actual model ID.
 * Falls back to the default if the alias is unknown.
 *
 * @param alias - The semantic alias or direct model ID.
 * @returns The resolved Gemini model identifier.
 */
export function resolveModel(alias?: string): string {
  if (!alias) return MODEL_ALIASES.default;
  if (alias in MODEL_ALIASES) {
    return (MODEL_ALIASES as any)[alias];
  }
  return alias;
}

/**
 * Resolves an ordered list of candidate models for multi-model failover resilience.
 */
export function getModelFallbacks(modelOrAlias?: string): string[] {
  const primary = resolveModel(modelOrAlias);
  const fallbacks = (MODEL_FALLBACK_CHAIN as Record<string, readonly string[]>)[primary] || [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
  ];
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}
