/**
 * ai/config/limits.js
 *
 * Responsibility:
 *   System-wide safety limits and operational parameters for the AI module.
 *
 *   TOKEN_LIMITS — max input/output tokens per step type:
 *     { defaultMaxOutput, outlineMaxOutput, articleSectionMaxOutput, ... }
 *
 *   TIMEOUTS_MS — per-step timeout in milliseconds:
 *     { default: 30000, stream: 120000, vision: 45000 }
 *
 *   RETRY — retry policy for provider calls:
 *     { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2 }
 *
 *   RATE_LIMITS — per-user request caps (enforced at the controller level):
 *     { maxRunsPerMinute: 5, maxTokensPerDay: 500000 }
 *
 * Why it exists:
 *   Safety limits must be easy to find and change without touching agent
 *   or step code. Centralizing them here also makes it obvious when a new
 *   step is being added whether it needs a custom limit.
 */
