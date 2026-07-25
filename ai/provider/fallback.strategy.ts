// =============================================================================
//  AI PROVIDER — FALLBACK & MULTI-PROVIDER RESILIENCE STRATEGY
//  ai/provider/fallback.strategy.ts
//
//  Design Decisions:
//  - Resolves primary and secondary providers from the central registry.
//  - Implements a retry-on-fallback execution strategy, wrapping LLM calls in a
//    failover chain.
// =============================================================================

import { providerRegistry } from "./registry";
import type { AIProvider } from "./types";
import { AIError } from "./types";

export class FallbackStrategy {
  /**
   * Resolves the primary provider, falling back to a secondary registered provider
   * if the primary execution fails.
   *
   * @param executeFn Callback to perform the actual provider operation.
   */
  async executeWithFallback<T>(
    executeFn: (provider: AIProvider) => Promise<T>
  ): Promise<T> {
    const providerIds = providerRegistry.list();
    if (providerIds.length === 0) {
      throw new AIError(
        "No providers registered in FallbackStrategy.",
        "model_error",
        false
      );
    }

    let lastError: Error | undefined;

    // Iterate through registered providers (e.g., primary "gemini", then secondary "openai" or backup)
    for (const providerId of providerIds) {
      try {
        const provider = providerRegistry.get(providerId);
        return await executeFn(provider);
      } catch (err: any) {
        console.error(`[FallbackStrategy] Provider "${providerId}" failed. Attempting next fallback... Error: ${err.message}`);
        lastError = err;
      }
    }

    throw lastError || new Error("All providers in fallback chain failed.");
  }
}

export const fallbackStrategy = new FallbackStrategy();
