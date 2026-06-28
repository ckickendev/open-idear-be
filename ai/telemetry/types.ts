// =============================================================================
//  AI TELEMETRY — LOGGER TYPES
//  ai/telemetry/types.ts
//
//  Design Decisions:
//  - All log entries are immutable (`readonly`), representing a historical event.
//  - Prompt shape supports both multi-turn chat messages and simple text strings.
//  - Errors are serialized into flat structures containing message, code, and
//    stack trace (if available) to avoid saving circular references.
//  - Decoupled `AILogger` interface lets developers implement custom sinks
//    (Console, File, MongoDB, Datadog) without changing model call sites.
// =============================================================================

import type { AIMessage, TokenUsage } from "../provider/types";

export interface LoggedPrompt {
  readonly system?: string;
  readonly messages: readonly AIMessage[];
}

export interface LoggedError {
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
  readonly raw?: unknown;
}

/**
 * Clean data structure containing all metadata for an AI execution.
 */
export interface AILogEntry {
  readonly id: string;
  readonly timestamp: Date;
  /** ID of the provider (e.g., "gemini") */
  readonly providerId: string;
  /** Actual model version used (e.g., "gemini-2.0-flash") */
  readonly model: string;
  /** Structured prompt data sent to the model */
  readonly prompt: LoggedPrompt;
  /** The generated response text (if successful) */
  readonly response?: string;
  /** Length of the response in characters */
  readonly responseLength?: number;
  /** Execution time in milliseconds */
  readonly executionTimeMs: number;
  /** Token usage statistics */
  readonly tokenUsage?: TokenUsage;
  /** Calculated cost of this request in USD */
  readonly estimatedCost?: number;
  /** Serialization of any exception encountered during execution */
  readonly error?: LoggedError;
}

/**
 * Interface representing an output sink for logs.
 */
export interface AILogger {
  readonly name: string;
  log(entry: AILogEntry): Promise<void>;
}
