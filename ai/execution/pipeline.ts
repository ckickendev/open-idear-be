import type { ExecutionContext, ExecutionResult, ExecutionMiddleware, ExecutionStage } from "./types";
import { aiRuntime } from "../runtime";
import { providerRegistry } from "../provider";
import { AIError } from "../provider/types";

/**
 * Pluggable pipeline runner orchestrating the Onion-style execution stage sequence.
 */
export class ExecutionPipeline {
  private readonly middlewares: ExecutionMiddleware[] = [];
  private readonly stages: ExecutionStage[] = [];

  constructor() {
    this.initDefaultStages();
  }

  /**
   * Register a middleware interceptor in the execution pipeline.
   */
  use(middleware: ExecutionMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Register a pluggable execution stage.
   */
  useStage(stage: ExecutionStage): this {
    this.stages.push(stage);
    return this;
  }

  /**
   * Clears all registered stages, allowing custom ordering.
   */
  clearStages(): this {
    this.stages.length = 0;
    return this;
  }

  /**
   * Run the pipeline from context generation down to provider completion.
   */
  async run<T = any>(context: ExecutionContext): Promise<ExecutionResult<T>> {
    let index = 0;

    const dispatch = async (): Promise<void> => {
      if (index >= this.stages.length) {
        return;
      }
      const stage = this.stages[index++];
      await stage.execute(context, dispatch);
    };

    try {
      await dispatch();
      const success = !context.error && context.parsedResponse !== undefined;
      return this.assembleResult<T>(context, success);
    } catch (err: any) {
      context.error = err;
      return this.assembleResult<T>(context, false);
    }
  }

  /**
   * Initializes standard baseline pipeline stages.
   */
  private initDefaultStages(): void {
    // Stage 1: Run pre-execution middlewares (e.g. Cache check, Input Guardrails)
    this.useStage({
      name: "PreMiddlewareStage",
      execute: async (context, next) => {
        for (const middleware of this.middlewares) {
          if (middleware.before) {
            await middleware.before(context);
            // Support middleware short-circuiting (e.g. Cache hit)
            if (context.parsedResponse !== undefined) {
              return;
            }
          }
        }
        await next();
      }
    });

    // Stage 2: Execute LLM runtime request using resolved policies (Retries + Fallbacks)
    this.useStage({
      name: "RuntimeExecutionStage",
      execute: async (context, next) => {
        const policy = context.policy;
        const maxAttempts = policy.maxAttempts;
        const initialDelayMs = policy.initialDelayMs;
        const backoffMultiplier = policy.backoffMultiplier;

        let attempt = 0;
        let lastError: Error | undefined;

        // Runner wrapper for a single provider execution attempt
        const executeAttempt = async (providerId: string): Promise<boolean> => {
          context.providerId = providerId;
          const runtimeOptions = {
            model: context.model,
            ...(context.temperature !== undefined && { temperature: context.temperature }),
            ...(context.maxOutputTokens !== undefined && { maxOutputTokens: context.maxOutputTokens }),
            ...(context.signal !== undefined && { signal: context.signal }),
            timeoutMs: policy.timeoutMs,
          };

          try {
            const result = await aiRuntime.executeRequest<any>(
              context.messages,
              context.responseFormat,
              {
                ...runtimeOptions,
                ...(context.schema !== undefined && { schema: context.schema }),
              }
            );
            context.parsedResponse = result.data;
            context.rawResponse = result.text;
            context.tokenUsage = result.usage;
            context.error = undefined;
            return true;
          } catch (err: any) {
            lastError = err;
            const isTimeout = context.signal?.aborted === false && err.message?.includes("timed out");
            const isRetryable = err instanceof AIError ? err.retryable : (isTimeout || err.status === 429 || err.status >= 500);

            if (attempt >= maxAttempts || !isRetryable) {
              return false;
            }

            const backoffMs = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            return false;
          }
        };

        // Try request executions loop on the specified provider
        const executeWithRetry = async (providerId: string): Promise<boolean> => {
          attempt = 0;
          while (attempt < maxAttempts) {
            attempt++;
            context.retryCount = attempt - 1;
            const success = await executeAttempt(providerId);
            if (success) return true;
          }
          return false;
        };

        try {
          const primaryProviderId = providerRegistry.getDefault().id;
          let success = await executeWithRetry(primaryProviderId);

          // If primary failed, attempt fallback provider
          if (!success) {
            const fallbackId = providerRegistry.list().find((id) => id !== primaryProviderId);
            if (fallbackId) {
              console.warn(
                `[RuntimeExecutionStage] Primary provider "${primaryProviderId}" failed. ` +
                `Attempting fallback provider "${fallbackId}"...`
              );
              success = await executeWithRetry(fallbackId);
            }
          }

          if (success) {
            await next();
          } else {
            throw lastError || new Error("LLM execution failed on primary and fallback providers.");
          }

        } catch (err: any) {
          context.error = err;

          // Attempt self-healing via error middlewares
          let healed = false;
          for (const middleware of this.middlewares) {
            if (middleware.onError) {
              const isHealed = await middleware.onError(context, err);
              if (isHealed) {
                healed = true;
                break;
              }
            }
          }

          if (healed && context.error === undefined) {
            await next();
          }
        }
      }
    });

    // Stage 3: Run post-execution middlewares (e.g. Telemetry collection, Caching insertion)
    this.useStage({
      name: "PostMiddlewareStage",
      execute: async (context, next) => {
        for (const middleware of this.middlewares) {
          if (middleware.after) {
            await middleware.after(context);
          }
        }
        await next();
      }
    });
  }

  /**
   * Helper to format context states into a single ExecutionResult.
   */
  private assembleResult<T>(context: ExecutionContext, success: boolean): ExecutionResult<T> {
    const elapsed = Date.now() - context.startTime;
    return {
      success,
      content: context.rawResponse,
      data: context.parsedResponse as T,
      ...(context.tokenUsage !== undefined && { tokenUsage: context.tokenUsage }),
      executionTimeMs: elapsed,
      retryCount: context.retryCount,
      warnings: context.warnings,
      estimatedCost: context.estimatedCost || 0,
      providerId: context.providerId,
      promptVersion: context.promptVersion,
      metadata: context.metadata,
      ...(context.error !== undefined && { error: context.error }),
    };
  }
}
