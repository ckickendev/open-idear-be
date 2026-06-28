// =============================================================================
//  AI AGENT — TYPES
//  ai/agent/types.ts
//
//  Design Decisions:
//  - Defines options and execution output shape for the Agent layer.
//  - Keeps the types decoupled from specific workflow step executors to maintain
//    clean dependency boundaries.
// =============================================================================

import type { AIContext } from "../context";
import type { TokenUsage } from "../provider/types";

/**
 * Options configuration for a single Agent run execution.
 */
export interface AgentOptions {
  /** Override the active prompt version configured in the registry */
  readonly promptVersionOverride?: string;
  /** Override default model alias (e.g. "quality" instead of "fast") */
  readonly modelOverride?: string;
  /** Context parameters (Language, Audience, Tone, etc.) */
  readonly context?: Partial<AIContext>;
  /** Optional AbortSignal for cooperative cancellation */
  readonly signal?: AbortSignal;
}

/**
 * Clean result container returned by any Agent run execution.
 */
export interface AgentResult<T = any> {
  readonly success: boolean;
  /** The final output data (parsed JSON or raw text string) */
  readonly data: T;
  /** Total token usage reported by the provider */
  readonly tokenUsage?: TokenUsage;
  /** Total execution time of the provider call in milliseconds */
  readonly executionTimeMs: number;
  /** Estimated cost of the request in USD */
  readonly estimatedCost: number;
}
