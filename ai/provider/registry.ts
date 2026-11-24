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
import { GeminiProvider } from "./gemini.provider";

const GEMINI_ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

/**
 * Strips whitespace and matching surrounding single/double quotes from an env value.
 */
function sanitizeEnvValue(raw: string | undefined): string {
  if (!raw) return "";
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

/**
 * Resolves a Gemini API key from environment variables, tolerating common
 * aliases and accidental whitespace in dashboard-configured variable names/values.
 */
export function resolveGeminiApiKey(
  env: Record<string, string | undefined> = process.env
): { apiKey: string; sourceKey?: string } {
  for (const candidateKey of GEMINI_ENV_KEYS) {
    const direct = sanitizeEnvValue(env[candidateKey]);
    if (direct) {
      return { apiKey: direct, sourceKey: candidateKey };
    }
  }

  // Fallback: match keys with accidental leading/trailing whitespace (e.g. "GEMINI_API_KEY ")
  for (const [rawKey, rawVal] of Object.entries(env)) {
    const trimmedKey = rawKey.trim();
    if ((GEMINI_ENV_KEYS as readonly string[]).includes(trimmedKey)) {
      const sanitized = sanitizeEnvValue(rawVal);
      if (sanitized) {
        return { apiKey: sanitized, sourceKey: rawKey };
      }
    }
  }

  return { apiKey: "" };
}

export interface ProviderRegistryOptions {
  /**
   * When true, empty lookups lazily attempt to register default providers
   * from environment variables (used by the production singleton).
   */
  readonly autoRegisterFromEnv?: boolean;
}

export interface ProviderBootstrapResult {
  readonly registered: string[];
  readonly missing: boolean;
  readonly sourceKey?: string;
}

// =============================================================================
//  ProviderRegistry
// =============================================================================

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  private readonly autoRegisterFromEnv: boolean;
  private autoRegisterSuppressed = false;

  constructor(options: ProviderRegistryOptions = {}) {
    this.autoRegisterFromEnv = options.autoRegisterFromEnv ?? false;
  }

  /**
   * Lazily registers default providers from process.env if this registry
   * is configured for auto-registration and currently empty.
   */
  private ensureAutoRegistered(): void {
    if (!this.autoRegisterFromEnv || this.autoRegisterSuppressed || this.providers.size > 0) {
      return;
    }
    this.bootstrapFromEnv();
  }

  /**
   * Registers default AI providers (currently GeminiProvider) from environment
   * variables if not already present. Clears prior unregister() suppression.
   */
  bootstrapFromEnv(
    env: Record<string, string | undefined> = process.env
  ): ProviderBootstrapResult {
    this.autoRegisterSuppressed = false;
    if (!this.providers.has("gemini")) {
      const { apiKey, sourceKey } = resolveGeminiApiKey(env);
      if (apiKey) {
        this.register(new GeminiProvider(apiKey));
        return {
          registered: [...this.providers.keys()],
          missing: false,
          ...(sourceKey !== undefined && { sourceKey }),
        };
      }
    }
    const existing = [...this.providers.keys()];
    return {
      registered: existing,
      missing: existing.length === 0,
    };
  }

  /**
   * Register a provider instance.
   * Calling register() with the same ID twice overwrites the first entry.
   * This allows replacing a production provider with a test double at runtime.
   *
   * @param provider  Any class implementing AIProvider.
   */
  register(provider: AIProvider): void {
    this.autoRegisterSuppressed = false;
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
    this.ensureAutoRegistered();
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AIError(
        `No AI provider registered with id "${id}". ` +
          `Available providers: [${this.list().join(", ")}]. ` +
          `Ensure GEMINI_API_KEY is configured or register() is called during application startup.`,
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
    this.ensureAutoRegistered();
    const first = this.providers.values().next();
    if (first.done) {
      throw new AIError(
        "No AI providers are registered. Set GEMINI_API_KEY in the server environment or call register() during startup.",
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
    this.ensureAutoRegistered();
    return this.providers.has(id);
  }

  /**
   * Returns all registered provider IDs. Used in error messages and monitoring.
   */
  list(): string[] {
    this.ensureAutoRegistered();
    return [...this.providers.keys()];
  }

  /**
   * Remove a provider from the registry.
   * Primarily useful in test teardown to restore clean state.
   */
  unregister(id: string): void {
    this.autoRegisterSuppressed = true;
    this.providers.delete(id);
  }
}

/**
 * Registers default AI providers (currently GeminiProvider) on the given
 * registry from environment variables if not already registered.
 */
export function registerDefaultProvidersFromEnv(
  registry: ProviderRegistry = providerRegistry,
  env: Record<string, string | undefined> = process.env
): ProviderBootstrapResult {
  return registry.bootstrapFromEnv(env);
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
export const providerRegistry = new ProviderRegistry({ autoRegisterFromEnv: true });
