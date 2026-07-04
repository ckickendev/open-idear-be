// =============================================================================
//  AI PROVIDER — TYPES
//  ai/provider/types.ts
//
//  This file is the entire public contract for the AI layer.
//  The rest of the application (agents, steps, pipelines, controllers)
//  imports ONLY from here. No Gemini-specific types ever leave this module.
//
//  Design decisions:
//  - MessageRole uses "assistant" (not Gemini's "model") for portability.
//  - CompletionOptions.model is a semantic alias key ("fast", "quality"),
//    not a provider-specific model ID. The provider resolves aliases internally.
//  - stream() returns AsyncGenerator<string, TokenUsage, undefined>:
//    yields text chunks, and returns TokenUsage as the generator's final value.
//    Callers that need usage after streaming use `yield*` delegation (see below).
//  - generateJSON<T>() is a first-class method (not a flag on generate()) so
//    that the generic type T flows cleanly without runtime casts.
// =============================================================================

// ─── Message ─────────────────────────────────────────────────────────────────

/** Role names are provider-independent. GeminiProvider maps "assistant" → "model" internally. */
export type MessageRole = "system" | "user" | "assistant";

export interface AIImagePart {
  readonly type: "image";
  readonly mimeType: string;
  readonly base64Data: string;
}

export interface AITextPart {
  readonly type: "text";
  readonly text: string;
}

export type AIMessagePart = AITextPart | AIImagePart;

/**
 * A single message in a conversation turn.
 * This is the only message format the application ever constructs.
 */
export interface AIMessage {
  readonly role: MessageRole;
  readonly content: string | AIMessagePart[];
}

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * Options passed to every provider method.
 * All fields are optional — providers supply sensible defaults.
 */
export interface CompletionOptions {
  /**
   * Semantic model alias: "fast" | "quality" | "vision".
   * Each provider resolves aliases to its own model IDs.
   * Defaults to "fast" if omitted.
   */
  readonly model?: string;

  /**
   * Sampling temperature (0–2). Lower = more deterministic.
   * Default: 0.7 for text, 0.2 for JSON generation.
   */
  readonly temperature?: number;

  /**
   * Hard cap on the number of output tokens.
   * Providers may enforce their own lower maximum.
   */
  readonly maxOutputTokens?: number;

  /**
   * AbortSignal for cooperative cancellation.
   * When signalled, the provider stops the in-flight request
   * and throws an AIError with code "cancelled".
   */
  readonly signal?: AbortSignal;
}

// ─── Response ─────────────────────────────────────────────────────────────────

/** Token consumption reported by the provider for a single request. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/** Result of a blocking text generation request. */
export interface AICompletion {
  readonly text: string;
  readonly usage: TokenUsage;
}

/** Result of a structured JSON generation request. */
export interface AIJSONResult<T = unknown> {
  readonly data: T;
  readonly usage: TokenUsage;
}

// ─── Provider interface ───────────────────────────────────────────────────────

/**
 * The single interface the entire application depends on for AI generation.
 *
 * Principle: Nothing outside ai/provider/ knows which company provides
 * the model. Swapping from Gemini to Claude means adding one new class
 * that implements this interface and updating the ProviderRegistry.
 */
export interface AIProvider {
  /** Stable identifier, e.g. "gemini". Used by ProviderRegistry. */
  readonly id: string;

  /**
   * Generate a text completion from a sequence of messages.
   * Blocks until the full response is received.
   *
   * @throws {AIError} on any provider failure (see AIErrorCode).
   */
  generate(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<AICompletion>;

  /**
   * Generate a structured response and parse it into type T.
   *
   * The provider instructs the model to output valid JSON (via its own
   * mechanism, e.g. Gemini's responseMimeType or OpenAI's response_format).
   * The provider also strips any markdown code fences the model may add.
   *
   * @throws {AIError} with code "parse_error" if the response is not valid JSON.
   * @throws {AIError} with code "model_error" on provider failure.
   */
  generateJSON<T = unknown>(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<AIJSONResult<T>>;

  /**
   * Stream a text completion token-by-token.
   *
   * Yields individual text chunks as they arrive from the provider.
   * The generator's return value (accessible via `yield*` delegation)
   * is the final TokenUsage after the stream completes.
   *
   * Simple consumer (text only):
   * ```ts
   * for await (const chunk of provider.stream(messages)) {
   *   res.write(chunk);
   * }
   * ```
   *
   * Consumer that needs both text and usage:
   * ```ts
   * async function* forwardStream(provider, messages) {
   *   const usage = yield* provider.stream(messages);
   *   return usage;
   * }
   * ```
   *
   * @throws {AIError} on connection failure or cancellation.
   */
  stream(
    messages: AIMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<string, TokenUsage, undefined>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Every error originating from the AI provider layer has this code.
 *
 * - rate_limited : Provider returned HTTP 429. Retryable.
 * - model_error  : Provider returned a non-retryable model failure.
 * - parse_error  : Response received but could not be parsed as expected JSON.
 * - timeout      : Request exceeded the configured timeout.
 * - cancelled    : Caller aborted the request via AbortSignal.
 * - network      : TCP/connection-level failure. Retryable.
 */
export type AIErrorCode =
  | "rate_limited"
  | "model_error"
  | "parse_error"
  | "timeout"
  | "cancelled"
  | "network";

/**
 * The only error type thrown by any AIProvider implementation.
 * Callers should never catch raw provider SDK errors — those are always
 * wrapped in AIError before propagating out of the provider layer.
 */
export class AIError extends Error {
  override readonly name = "AIError";

  constructor(
    message: string,
    public readonly code: AIErrorCode,
    /** Whether retrying the same request is likely to succeed. */
    public readonly retryable: boolean,
    /** The original SDK error, for logging and debugging only. */
    public readonly cause?: unknown
  ) {
    super(message);
    // Restore prototype chain in CommonJS transpilation
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
