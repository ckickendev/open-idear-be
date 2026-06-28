// =============================================================================
//  PROVIDER REGISTRY
//  ai/provider/registry.ts
//
//  A typed registry that maps provider IDs to AIProvider instances.
//
//  Design decisions:
//  - The registry is a class (not a plain object) so it can be injected
//    in tests — replace the real registry with a mock registry that holds
//    a MockProvider instance. No global state required in tests.
//  - The exported `providerRegistry` is a module-level singleton, which is
//    the right default for production. Tests create their own instances.
//  - get() throws a descriptive error (not undefined) so callers never have
//    to null-check. A missing provider is always a programmer error, not a
//    runtime condition to handle gracefully.
//  - The class is generic enough to hold any future provider (Claude, Mistral)
//    without modification — just call register() at startup.
// =============================================================================

import type { AIProvider } from "./types";
import { AIError } from "./types";

// =============================================================================
//  ProviderRegistry
// =============================================================================

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  /**
   * Register a provider instance.
   * Calling register() with the same ID twice overwrites the first entry.
   * This allows replacing a production provider with a test double at runtime.
   *
   * @param provider  Any class implementing AIProvider.
   */
  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Retrieve a registered provider by its stable ID.
   *
   * @param id  Provider ID, e.g. "gemini".
   * @throws    AIError (code="model_error") if the ID is not registered.
   *            This is intentional: a missing provider means startup configuration
   *            is wrong — it should surface loudly, not return undefined.
   */
  get(id: string): AIProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AIError(
        `No AI provider registered with id "${id}". ` +
          `Available providers: [${this.list().join(", ")}]. ` +
          `Ensure register() is called during application startup.`,
        "model_error",
        false
      );
    }
    return provider;
  }

  /**
   * Returns the default provider (first registered).
   * Useful for steps that do not care which specific provider is used.
   *
   * @throws AIError if no providers are registered at all.
   */
  getDefault(): AIProvider {
    const first = this.providers.values().next();
    if (first.done) {
      throw new AIError(
        "No AI providers are registered. Call register() during startup.",
        "model_error",
        false
      );
    }
    return first.value;
  }

  /**
   * Check whether a provider is registered without throwing.
   * Useful for conditional feature availability checks.
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Returns all registered provider IDs. Used in error messages and monitoring.
   */
  list(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Remove a provider from the registry.
   * Primarily useful in test teardown to restore clean state.
   */
  unregister(id: string): void {
    this.providers.delete(id);
  }
}

// =============================================================================
//  Module-level singleton — used by the production application
// =============================================================================

/**
 * The single ProviderRegistry instance shared by the entire application.
 *
 * Startup sequence (in your server entry point):
 * ```js
 * import { providerRegistry } from './ai/provider';
 * import { GeminiProvider } from './ai/provider';
 *
 * providerRegistry.register(new GeminiProvider(process.env.GEMINI_API_KEY));
 * ```
 *
 * Usage in workflow steps and agents (via WorkflowContext):
 * ```js
 * const provider = ctx.provider; // already resolved — never import registry in steps
 * ```
 *
 * Direct usage in controllers (before WorkflowContext exists):
 * ```js
 * import { providerRegistry } from './ai/provider';
 * const provider = providerRegistry.get('gemini');
 * ```
 */
export const providerRegistry = new ProviderRegistry();
