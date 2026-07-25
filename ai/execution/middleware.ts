import type { ExecutionContext, ExecutionMiddleware } from "./types";
import { calculateCost, aiLogger } from "../telemetry";
import { aiRuntime } from "../runtime";
import { AIError } from "../provider/types";
import { proactiveRateLimiter } from "./rateLimiter";

// =============================================================================
//  METRICS & COST MIDDLEWARE
// =============================================================================

export class MetricsMiddleware implements ExecutionMiddleware {
  readonly name = "Metrics";

  after(context: ExecutionContext): void {
    if (context.tokenUsage) {
      context.estimatedCost = calculateCost(context.model, context.tokenUsage);
    }
  }
}

// =============================================================================
//  TELEMETRY LOGGING MIDDLEWARE
// =============================================================================

export class TelemetryLoggingMiddleware implements ExecutionMiddleware {
  readonly name = "TelemetryLogging";

  async after(context: ExecutionContext): Promise<void> {
    await this.log(context);
  }

  async onError(context: ExecutionContext): Promise<boolean> {
    await this.log(context);
    return false; // Let error propagate
  }

  private async log(context: ExecutionContext): Promise<void> {
    try {
      await aiLogger.log({
        providerId: "default",
        model: context.model,
        prompt: {
          system: "Execution Pipeline Block",
          messages: context.messages,
        },
        durationMs: Date.now() - context.startTime,
        ...(context.rawResponse !== undefined && { response: context.rawResponse }),
        ...(context.tokenUsage !== undefined && { usage: context.tokenUsage }),
        ...(context.error !== undefined && { error: context.error }),
        promptName: context.promptName,
        promptVersion: context.promptVersion,
        retryCount: context.retryCount,
      });
    } catch (logErr) {
      console.error(`[TelemetryLoggingMiddleware] Logging failed:`, logErr);
    }
  }
}

// =============================================================================
//  IN-MEMORY CACHE MIDDLEWARE
// =============================================================================

export class CacheMiddleware implements ExecutionMiddleware {
  readonly name = "Cache";
  private static readonly cacheStore = new Map<string, { parsed: any; raw: string; usage: any }>();

  before(context: ExecutionContext): void {
    const key = this.generateCacheKey(context);
    const entry = CacheMiddleware.cacheStore.get(key);
    if (entry) {
      console.log(`[CacheMiddleware] Cache hit for prompt "${context.promptName}"`);
      context.parsedResponse = entry.parsed;
      context.rawResponse = entry.raw;
      context.tokenUsage = entry.usage;
    }
  }

  after(context: ExecutionContext): void {
    if (!context.error && context.parsedResponse !== undefined) {
      const key = this.generateCacheKey(context);
      CacheMiddleware.cacheStore.set(key, {
        parsed: context.parsedResponse,
        raw: context.rawResponse || "",
        usage: context.tokenUsage,
      });
    }
  }

  private generateCacheKey(context: ExecutionContext): string {
    const serializedMessages = JSON.stringify(context.messages);
    return `${context.scope}:${context.promptName}:${context.promptVersion}:${serializedMessages}`;
  }
}

// =============================================================================
//  BUDGET & TOKEN LIMITS MIDDLEWARE
// =============================================================================

export class BudgetMiddleware implements ExecutionMiddleware {
  readonly name = "Budget";
  private readonly maxCostLimit = 0.50; // $0.50 USD max cost per request

  before(context: ExecutionContext): void {
    // Perform pre-flight safety check on prompt length estimation
    const estimatedTokens = JSON.stringify(context.messages).length / 4;
    if (estimatedTokens > 50000) {
      throw new Error(`[BudgetMiddleware] Prompt token context size estimate exceeds safety buffer limit.`);
    }
  }

  after(context: ExecutionContext): void {
    if (context.estimatedCost && context.estimatedCost > this.maxCostLimit) {
      throw new Error(`[BudgetMiddleware] Cost estimate of $${context.estimatedCost} exceeded limit of $${this.maxCostLimit}`);
    }
  }
}

// =============================================================================
//  SAFETY & GUARDRAILS MIDDLEWARE
// =============================================================================

export class SafetyMiddleware implements ExecutionMiddleware {
  readonly name = "Safety";
  private readonly blocklist = ["harmful-payload-test", "malicious-xss-inject"];

  before(context: ExecutionContext): void {
    const inputStr = JSON.stringify(context.input).toLowerCase();
    for (const phrase of this.blocklist) {
      if (inputStr.includes(phrase)) {
        throw new Error(`[SafetyMiddleware] Input violated safety policy: matched blocked word "${phrase}"`);
      }
    }
  }

  after(context: ExecutionContext): void {
    if (context.rawResponse) {
      const responseStr = context.rawResponse.toLowerCase();
      for (const phrase of this.blocklist) {
        if (responseStr.includes(phrase)) {
          throw new Error(`[SafetyMiddleware] Output violated safety policy: matched blocked word "${phrase}"`);
        }
      }
    }
  }
}

// =============================================================================
//  JSON SELF-HEALING MIDDLEWARE
// =============================================================================

export class JsonSelfHealingMiddleware implements ExecutionMiddleware {
  readonly name = "JsonSelfHealing";
  private readonly maxSelfHealingAttempts = 1;

  async onError(context: ExecutionContext, error: Error): Promise<boolean> {
    const isParseError = error instanceof AIError && error.code === "parse_error";
    if (!isParseError || context.responseFormat !== "json" || !context.schema) {
      return false;
    }

    const currentAttempt = context.metadata.selfHealingAttempts || 0;
    if (currentAttempt >= this.maxSelfHealingAttempts) {
      return false;
    }

    context.metadata.selfHealingAttempts = currentAttempt + 1;
    context.retryCount++;

    console.warn(`[JsonSelfHealingMiddleware] Self-healing retry attempt ${context.metadata.selfHealingAttempts}...`);

    const repairMessage =
      `Your previous output failed schema validation: "${error.message}". ` +
      `Please regenerate the JSON output ensuring it strictly matches the schema and is properly formatted. ` +
      `Do not include any explanations, markdown code blocks, or additional characters outside of the raw JSON.`;

    const repairMessages = [
      ...context.messages,
      { role: "assistant" as const, content: context.rawResponse || "{}" },
      { role: "user" as const, content: repairMessage },
    ];

    try {
      const runtimeOptions = {
        model: context.model,
        ...(context.temperature !== undefined && { temperature: context.temperature }),
        ...(context.maxOutputTokens !== undefined && { maxOutputTokens: context.maxOutputTokens }),
        ...(context.signal !== undefined && { signal: context.signal }),
        ...(context.policy.timeoutMs !== undefined && { timeoutMs: context.policy.timeoutMs }),
        scope: context.scope,
      };

      const healResult = await aiRuntime.executeRequest<any>(
        repairMessages,
        context.responseFormat,
        {
          ...runtimeOptions,
          schema: context.schema,
        }
      );

      context.parsedResponse = healResult.data;
      context.rawResponse = healResult.text;
      context.tokenUsage = healResult.usage;
      context.error = undefined;

      console.log(`[JsonSelfHealingMiddleware] Self-healing succeeded for ${context.promptName}.`);
      return true;
    } catch (healErr: any) {
      context.error = healErr;
      console.error(`[JsonSelfHealingMiddleware] Self-healing failed:`, healErr);
      return false;
    }
  }
}

// =============================================================================
//  HIGH-LEVEL SEMANTIC RETRY MIDDLEWARE
// =============================================================================

export class RetryMiddleware implements ExecutionMiddleware {
  readonly name = "Retry";

  async onError(context: ExecutionContext, error: Error): Promise<boolean> {
    const isRateLimit = error.message.includes("429") || error.message.toLowerCase().includes("rate limit");
    const currentAttempt = context.metadata.retryAttempts || 0;

    if (!isRateLimit || currentAttempt >= 2) {
      return false;
    }

    context.metadata.retryAttempts = currentAttempt + 1;
    context.retryCount++;

    const delayMs = 2000 * Math.pow(2, currentAttempt);
    console.warn(`[RetryMiddleware] Rate limit met. Waiting ${delayMs}ms before retrying...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      const runtimeOptions = {
        model: context.model,
        ...(context.temperature !== undefined && { temperature: context.temperature }),
        ...(context.maxOutputTokens !== undefined && { maxOutputTokens: context.maxOutputTokens }),
        ...(context.signal !== undefined && { signal: context.signal }),
        ...(context.policy.timeoutMs !== undefined && { timeoutMs: context.policy.timeoutMs }),
        scope: context.scope,
      };

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

      console.log(`[RetryMiddleware] Rate-limit retry succeeded.`);
      return true;
    } catch (retryErr: any) {
      context.error = retryErr;
      return false;
    }
  }
}

// =============================================================================
//  PROACTIVE RATE LIMITER MIDDLEWARE
// =============================================================================

export class RateLimiterMiddleware implements ExecutionMiddleware {
  readonly name = "RateLimiter";

  async before(_context: ExecutionContext): Promise<void> {
    await proactiveRateLimiter.throttle();
  }
}
