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
  fast: "gemini-2.5-flash",
  /** Best reasoning: SEO scoring, quality review, article writing */
  quality: "gemini-2.5-flash",
  /** Multimodal: analyzeImage.step, OCR, vision tasks */
  vision: "gemini-2.5-flash",
  /** Default fallback when no alias is specified */
  default: "gemini-2.5-flash",
} as const;


/**
 * Resolves a semantic alias (e.g., "fast") to an actual model ID.
 * Falls back to the default if the alias is unknown.
 *
 * @param alias - The semantic alias or direct model ID.
 * @returns The resolved Gemini model identifier.
 */
export function resolveModel(alias: string): string {
  return (MODEL_ALIASES as any)[alias] || MODEL_ALIASES.default;
}
