import { fallbackStrategy } from "../provider";
import { type AIMessage, type AICompletion, type AIJSONResult, type TokenUsage, AIError } from "../provider/types";
import type { ZodSchema } from "zod";

// =============================================================================
//  AI RUNTIME ENGINE — SIMPLIFIED FOR EXECUTIONS ONLY
//  ai/runtime/AIRuntime.ts
//
//  Design Decisions:
//  - stripped of retry policies, logging, telemetry, and fallback routing.
//  - Performs strictly single completion requests using configured settings.
// =============================================================================

export interface RuntimeRequestOptions {
  readonly model?: string | undefined;
  readonly temperature?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
  readonly schema?: ZodSchema<any> | undefined;
}

export class AIRuntime {
  /**
   * Helper that executes the request based on the response format choice.
   */
  async executeRequest<T = any>(
    messages: AIMessage[],
    format: "text" | "json",
    options: RuntimeRequestOptions = {}
  ): Promise<{ data: T; text: string; usage?: TokenUsage | undefined }> {
    if (format === "json") {
      const res = await this.executeJSON<T>(messages, options);
      if (options.schema) {
        const parseResult = options.schema.safeParse(res.data);
        if (!parseResult.success) {
          throw new AIError(
            `JSON output does not match schema: ${parseResult.error.message}`,
            "parse_error",
            false
          );
        }
        return {
          data: parseResult.data as T,
          text: JSON.stringify(parseResult.data),
          usage: res.usage,
        };
      }
      return {
        data: res.data,
        text: JSON.stringify(res.data),
        usage: res.usage,
      };
    } else {
      const res = await this.execute(messages, options);
      return {
        data: res.text as unknown as T,
        text: res.text,
        usage: res.usage,
      };
    }
  }

  /**
   * Executes a single text completion request against the current provider.
   */
  async execute(
    messages: AIMessage[],
    options: RuntimeRequestOptions = {}
  ): Promise<AICompletion> {
    const providerOptions = this.toProviderOptions(options);

    let timeoutId: NodeJS.Timeout | undefined;
    const controller = new AbortController();

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
    }

    try {
      const result = await fallbackStrategy.executeWithFallback(async (provider) => {
        return await provider.generate(messages, {
          ...providerOptions,
          signal: controller.signal,
        });
      });
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Executes a single structured JSON completion request against the current provider.
   */
  async executeJSON<T = unknown>(
    messages: AIMessage[],
    options: RuntimeRequestOptions = {}
  ): Promise<AIJSONResult<T>> {
    const providerOptions = this.toProviderOptions(options);

    let timeoutId: NodeJS.Timeout | undefined;
    const controller = new AbortController();

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
    }

    try {
      const result = await fallbackStrategy.executeWithFallback(async (provider) => {
        return await provider.generateJSON<T>(messages, {
          ...providerOptions,
          signal: controller.signal,
        });
      });
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    }
  }

  private toProviderOptions(options: RuntimeRequestOptions) {
    return {
      ...(options.model !== undefined && { model: options.model }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.maxOutputTokens !== undefined && { maxOutputTokens: options.maxOutputTokens }),
    };
  }
}

export const aiRuntime = new AIRuntime();
