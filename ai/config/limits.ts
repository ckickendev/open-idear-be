/**
 * ai/config/limits.ts
 *
 * System-wide safety limits and operational parameters for the AI module.
 * Centralizes all token, timeout, retry, and rate limit constants so they
 * are easy to find and adjust without touching agent or step code.
 */

/** Maximum output token limits per step type */
export const TOKEN_LIMITS = {
  /** Default max output tokens for most steps */
  defaultMaxOutput: 4096,
  /** Outline generation (short, structured JSON) */
  outlineMaxOutput: 2048,
  /** Article section writing (longer prose) */
  articleSectionMaxOutput: 8192,
  /** Full article generation (streaming) */
  fullArticleMaxOutput: 16384,
  /** SEO metadata generation (short outputs) */
  seoMaxOutput: 1024,
  /** Image analysis / alt text (short outputs) */
  visionMaxOutput: 1024,
  /** Review and scoring (medium outputs) */
  reviewMaxOutput: 2048,
};

/** Per-step timeout in milliseconds */
export const TIMEOUTS_MS = {
  /** Default timeout for standard JSON completions */
  default: 30000,
  /** Streaming article writing (long-running) */
  stream: 120000,
  /** Vision / image analysis tasks */
  vision: 45000,
  /** SEO metadata generation */
  seo: 30000,
  /** Growth engine tasks */
  growth: 45000,
};

/** Retry policy for provider calls */
export const RETRY = {
  /** Maximum number of retry attempts */
  maxAttempts: 3,
  /** Initial delay before first retry (ms) */
  initialDelayMs: 1000,
  /** Multiplier applied to delay after each retry */
  backoffMultiplier: 2,
  /** Random jitter added to delay to prevent thundering herd (ms) */
  jitterMs: 200,
};

/** Per-user request rate limits (enforced at the controller level) */
export const RATE_LIMITS = {
  /** Maximum AI execution runs per user per minute */
  maxRunsPerMinute: 5,
  /** Maximum total tokens consumed per user per day */
  maxTokensPerDay: 500000,
  /** Maximum estimated cost per user per day (USD) */
  maxCostPerDay: 2.00,
};
