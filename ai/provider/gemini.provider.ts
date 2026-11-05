// =============================================================================
//  GEMINI PROVIDER
//  ai/provider/gemini.provider.ts
//
//  THE ONLY FILE IN THE ENTIRE CODEBASE THAT IMPORTS @google/generative-ai.
//
//  Responsibilities:
//  1. Model alias resolution  — "fast" / "quality" / "vision" → Gemini model ID
//  2. Message format adapter  — AIMessage[] → Gemini Content[] + systemInstruction
//  3. generate()              — blocking text call with retry
//  4. generateJSON<T>()       — blocking JSON call with response_mime_type + parsing
//  5. stream()                — async generator yielding text chunks + final TokenUsage
//  6. withRetry()             — exponential backoff for retryable errors
//  7. Error normalization     — all Gemini SDK errors become AIError
//
//  Design decisions:
//  - A single GoogleGenerativeAI client is created once in the constructor.
//    It is never shared between provider instances (each instance = its own key).
//  - Models are instantiated per-call via _getModel(), not cached, because
//    generation config (temperature, maxOutputTokens) varies per request.
//  - System messages in AIMessage[] are extracted and passed as Gemini's
//    `systemInstruction` param, because Gemini does not allow "system" in
//    its Contents array — only "user" and "model" roles are valid there.
//  - generateJSON uses responseMimeType: "application/json" to force clean
//    JSON output from Gemini (no code fences), with a JSON.parse fallback
//    that strips fences if an older model ignores the MIME type.
//  - The AbortSignal from CompletionOptions is checked between retry attempts
//    and before yield in stream(). Gemini's SDK does not natively accept a
//    signal, so cancellation is cooperative, not preemptive.
// =============================================================================

import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type Content,
  type GenerationConfig,
  type Part,
} from "@google/generative-ai";

import type {
  AIProvider,
  AIMessage,
  AICompletion,
  AIJSONResult,
  CompletionOptions,
  TokenUsage,
} from "./types";

import { AIError } from "./types";

import {
  MODEL_ALIASES,
  resolveModel,
  getModelFallbacks,
} from "../config/models";

// ─── Retry Configuration ──────────────────────────────────────────────────────

const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  jitterMs: 200,
} as const;

// ─── Token Usage Defaults ─────────────────────────────────────────────────────

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

// =============================================================================
//  GeminiProvider
// =============================================================================

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  private readonly client: GoogleGenerativeAI;

  /**
   * @param apiKey  Gemini API key (from process.env.GEMINI_API_KEY).
   *                Passed explicitly — no env reads inside this class.
   */
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("GeminiProvider requires a non-empty API key.");
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PUBLIC: generate()
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Blocking text generation with automatic retry and model-level failover.
   * The full response is buffered in memory before returning.
   */
  async generate(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AICompletion> {
    const candidateModels = getModelFallbacks(options.model);
    let lastError: AIError | undefined;

    for (const modelId of candidateModels) {
      options.signal?.throwIfAborted();
      try {
        return await this.withRetry(async () => {
          options.signal?.throwIfAborted();

          const { model, systemInstruction, contents } =
            this._prepareRequest(messages, options, modelId);
          const generationConfig = this._buildGenerationConfig(options);

          const result = await model.generateContent({
            contents,
            generationConfig,
            ...(systemInstruction ? { systemInstruction } : {}),
          });

          const response = result.response;
          const text = response.text();

          return {
            text,
            usage: this._extractUsage(response.usageMetadata),
          };
        }, options.signal);
      } catch (err: any) {
        const aiError = err instanceof AIError ? err : this._normalizeError(err);
        lastError = aiError;

        if (aiError.code === "cancelled" || options.signal?.aborted) {
          throw aiError;
        }

        console.warn(
          `[GeminiProvider] Candidate model "${modelId}" failed (${aiError.code}: ${aiError.message}). Attempting model fallback...`
        );
      }
    }

    throw lastError || new AIError("All candidate Gemini models failed.", "model_error", false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PUBLIC: generateJSON<T>()
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Structured JSON generation.
   *
   * Uses responseMimeType: "application/json" so Gemini returns clean JSON
   * without markdown code fences. Falls back to fence-stripping + JSON.parse
   * if the raw response is not directly parseable (older model behaviour).
   *
   * Uses a lower default temperature (0.2) because deterministic output
   * is more important for structured data than for prose.
   *
   * @throws {AIError} code="parse_error" if the model returns invalid JSON.
   */
  async generateJSON<T = unknown>(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AIJSONResult<T>> {
    const candidateModels = getModelFallbacks(options.model || "fast");
    let lastError: AIError | undefined;

    for (const modelId of candidateModels) {
      options.signal?.throwIfAborted();
      try {
        return await this.withRetry(async () => {
          options.signal?.throwIfAborted();

          const { model, systemInstruction, contents } =
            this._prepareRequest(messages, options, modelId);

          const generationConfig: GenerationConfig = {
            ...this._buildGenerationConfig(options),
            // Force JSON output at the API level — no code fences, no preamble
            responseMimeType: "application/json",
            // Lower temperature for structured output (caller can override)
            temperature: options.temperature ?? 0.2,
          };

          const result = await model.generateContent({
            contents,
            generationConfig,
            ...(systemInstruction ? { systemInstruction } : {}),
          });

          const response = result.response;
          const rawText = response.text();

          const data = this._parseJSON<T>(rawText);

          return {
            data,
            usage: this._extractUsage(response.usageMetadata),
          };
        }, options.signal);
      } catch (err: any) {
        const aiError = err instanceof AIError ? err : this._normalizeError(err);
        lastError = aiError;

        // If cancelled by caller, do NOT attempt next model fallback
        if (aiError.code === "cancelled" || options.signal?.aborted) {
          throw aiError;
        }

        console.warn(
          `[GeminiProvider] Candidate model "${modelId}" failed in generateJSON (${aiError.code}: ${aiError.message}). Attempting model fallback...`
        );
      }
    }

    throw lastError || new AIError("All candidate Gemini models failed in generateJSON.", "model_error", false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PUBLIC: stream()
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Streaming text generation with model-level failover.
   *
   * Yields each text chunk as it arrives from Gemini's streaming API.
   * The generator's return value is the final TokenUsage, available via
   * the `yield*` delegation pattern or by manually iterating with .next().
   *
   * Cancellation: if options.signal is aborted, the generator throws
   * AIError("cancelled") on the next yield boundary.
   */
  async *stream(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<string, TokenUsage, undefined> {
    options.signal?.throwIfAborted();

    const candidateModels = getModelFallbacks(options.model || "default");
    let lastError: any;

    for (const modelId of candidateModels) {
      options.signal?.throwIfAborted();

      const { model, systemInstruction, contents } = this._prepareRequest(
        messages,
        options,
        modelId
      );
      const generationConfig = this._buildGenerationConfig(options);

      let streamResult;
      try {
        streamResult = await model.generateContentStream({
          contents,
          generationConfig,
          ...(systemInstruction ? { systemInstruction } : {}),
        });
        // CRITICAL: Attach a catch handler immediately to prevent unhandled promise rejection
        // if stream reading errors out before or during iteration
        streamResult.response.catch(() => {});
      } catch (err) {
        const normalized = this._normalizeError(err);
        lastError = normalized;
        if (normalized.code === "cancelled" || options.signal?.aborted) {
          throw normalized;
        }
        console.warn(`[GeminiProvider] Stream connect failed on model "${modelId}" (${normalized.message}). Trying fallback model...`);
        continue;
      }

      try {
        for await (const chunk of streamResult.stream) {
          // Check for cancellation on every chunk boundary
          if (options.signal?.aborted) {
            throw new AIError(
              "Stream cancelled by caller.",
              "cancelled",
              false,
              options.signal.reason
            );
          }

          const text = chunk.text();
          if (text) {
            yield text;
          }
        }

        // The final response contains the aggregated usage metadata
        try {
          const finalResponse = await streamResult.response;
          return this._extractUsage(finalResponse?.usageMetadata);
        } catch {
          return ZERO_USAGE;
        }
      } catch (err) {
        if (err instanceof AIError) throw err;
        throw this._normalizeError(err);
      }
    }

    throw lastError || new AIError("All stream candidate models failed.", "model_error", false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: Request preparation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Converts provider-independent AIMessage[] into Gemini's wire format.
   *
   * Gemini specifics handled here (invisible to callers):
   * - "system" role → extracted as `systemInstruction` (Gemini does not
   *   allow system messages inside the Contents array).
   * - "assistant" role → mapped to Gemini's "model" role.
   * - Multiple system messages are concatenated (best effort).
   */
  private _prepareRequest(
    messages: AIMessage[],
    options: CompletionOptions,
    overrideModelId?: string
  ): {
    model: GenerativeModel;
    systemInstruction: string | undefined;
    contents: Content[];
  } {
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const systemInstruction =
      systemMessages.length > 0
        ? systemMessages
            .map((m) => {
              if (typeof m.content === "string") {
                return m.content;
              }
              return m.content
                .filter((p) => p.type === "text")
                .map((p) => (p as any).text)
                .join("\n");
            })
            .join("\n\n")
        : undefined;

    const contents: Content[] = conversationMessages.map((m) => {
      let parts: Part[] = [];
      if (typeof m.content === "string") {
        parts.push({ text: m.content } as Part);
      } else {
        parts = m.content.map((part) => {
          if (part.type === "text") {
            return { text: part.text } as Part;
          } else {
            return {
              inlineData: {
                mimeType: part.mimeType,
                data: part.base64Data,
              },
            } as Part;
          }
        });
      }

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    const modelId = overrideModelId || this._resolveModelAlias(options.model);
    const model = this.client.getGenerativeModel({ model: modelId });

    return { model, systemInstruction, contents };
  }

  /** Builds Gemini's GenerationConfig from provider-independent CompletionOptions. */
  private _buildGenerationConfig(options: CompletionOptions): GenerationConfig {
    const config: GenerationConfig = {};
    if (options.temperature !== undefined) config.temperature = options.temperature;
    if (options.maxOutputTokens !== undefined)
      config.maxOutputTokens = options.maxOutputTokens;
    return config;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: Model alias resolution
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolves a semantic alias to a Gemini model ID.
   * Falls back to "default" if the alias is unknown.
   */
  private _resolveModelAlias(alias?: string): string {
    return resolveModel(alias);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: JSON parsing
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Parses the model's raw text output as JSON.
   *
   * Even with responseMimeType: "application/json", older models or
   * edge cases can wrap output in markdown fences. This method strips
   * them before parsing.
   *
   * @throws {AIError} code="parse_error" if the text is not valid JSON.
   */
  private _parseJSON<T>(rawText: string): T {
    // Strip optional markdown code fences: ```json ... ``` or ``` ... ```
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      throw new AIError(
        `Model returned invalid JSON. Raw output: ${cleaned.slice(0, 200)}`,
        "parse_error",
        false,
        err
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: Token usage extraction
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Extracts token counts from Gemini's usageMetadata.
   * Returns ZERO_USAGE if metadata is absent (streaming chunks before final).
   */
  private _extractUsage(
    meta:
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        }
      | undefined
  ): TokenUsage {
    if (!meta) return ZERO_USAGE;
    return {
      inputTokens: meta.promptTokenCount ?? 0,
      outputTokens: meta.candidatesTokenCount ?? 0,
      totalTokens: meta.totalTokenCount ?? 0,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: Retry with exponential backoff
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Wraps an async operation with exponential backoff retry logic.
   *
   * Only errors where AIError.retryable === true trigger a retry.
   * Non-retryable errors (bad request, parse failure, cancellation) are
   * rethrown immediately without consuming retry budget.
   *
   * Jitter is added to each delay to reduce thundering herd under load.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
    config = RETRY_CONFIG
  ): Promise<T> {
    let lastError: AIError | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const aiError = err instanceof AIError ? err : this._normalizeError(err);

        if (!aiError.retryable || attempt === config.maxAttempts) {
          throw aiError;
        }

        // Check cancellation before sleeping
        signal?.throwIfAborted();

        let delay =
          config.initialDelayMs * config.backoffMultiplier ** (attempt - 1) +
          Math.random() * config.jitterMs;

        // If rate limited, give Gemini a reasonable backoff without exceeding request timeout
        if (aiError.code === "rate_limited") {
          delay = Math.max(delay, 2_000 * attempt);
        }

        await this._sleep(delay);
        lastError = aiError;
      }
    }

    // TypeScript: this line is unreachable but satisfies the type checker
    throw lastError!;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: Error normalization
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Converts any error from the Gemini SDK into a typed AIError.
   *
   * This is the error firewall: Gemini SDK error types never escape this method.
   * All callers of the provider layer see only AIError.
   *
   * HTTP status codes are inferred from the error message when the SDK
   * does not expose them as structured fields (SDK behaviour varies by version).
   */
  private _normalizeError(err: unknown): AIError {
    if (err instanceof AIError) return err;

    // AbortError from native fetch / AbortSignal
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "AbortSignalError")
    ) {
      return new AIError("Request was cancelled.", "cancelled", false, err);
    }

    const message =
      err instanceof Error ? err.message : "Unknown provider error";
    const lowerMessage = message.toLowerCase();

    // Check specifically for Daily Quota / Free Tier Limit Exceeded (which cannot be fixed with a short retry)
    const isDailyQuota =
      lowerMessage.includes("per day") ||
      lowerMessage.includes("daily") ||
      lowerMessage.includes("requests per day") ||
      lowerMessage.includes("limit exceeded on free tier");

    if (isDailyQuota) {
      return new AIError(
        `Gemini daily quota limit exceeded for model: ${message}`,
        "quota_exceeded",
        false,
        err
      );
    }

    // Temporary rate limit (RPM/TPM)
    if (
      lowerMessage.includes("429") ||
      lowerMessage.includes("quota") ||
      lowerMessage.includes("resource_exhausted")
    ) {
      return new AIError(
        "Gemini rate limit exceeded. Retrying…",
        "rate_limited",
        true,
        err
      );
    }

    // Model capacity / spikes in demand
    if (
      lowerMessage.includes("503") ||
      lowerMessage.includes("high demand") ||
      lowerMessage.includes("overloaded")
    ) {
      return new AIError(
        `AI provider model overloaded: ${message}`,
        "service_unavailable",
        true,
        err
      );
    }

    // Model deprecated or not found
    if (
      lowerMessage.includes("404") ||
      lowerMessage.includes("not found") ||
      lowerMessage.includes("no longer available")
    ) {
      return new AIError(
        `AI provider model not found or deprecated: ${message}`,
        "model_error",
        false,
        err
      );
    }

    if (
      lowerMessage.includes("fetch") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("econnrefused") ||
      lowerMessage.includes("enotfound")
    ) {
      return new AIError(
        "Network error contacting the AI provider.",
        "network",
        true,
        err
      );
    }

    if (lowerMessage.includes("timeout") || lowerMessage.includes("deadline")) {
      return new AIError(
        "AI provider request timed out.",
        "timeout",
        true,
        err
      );
    }

    if (lowerMessage.includes("400") || lowerMessage.includes("invalid")) {
      return new AIError(
        `Invalid request to AI provider: ${message}`,
        "model_error",
        false,
        err
      );
    }

    // All other errors: treat as model errors (not retryable by default)
    return new AIError(
      `AI provider error: ${message}`,
      "model_error",
      false,
      err
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRIVATE: Utilities
  // ──────────────────────────────────────────────────────────────────────────

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
