import type { ExecutionResult } from "./types";
import { ExecutionPipeline } from "./pipeline";
import { MetricsMiddleware, TelemetryLoggingMiddleware, JsonSelfHealingMiddleware, RateLimiterMiddleware } from "./middleware";
import { aiConfigCenter, type AIConfigScope } from "../config";
import { policyRegistry } from "./policy";
import { ExecutionContextContainer } from "./context";
import { promptRegistry, PromptBuilder } from "../prompt";
import { AIContextCollector, type AIContext } from "../context";
import { providerRegistry } from "../provider";
import { aiLogger } from "../telemetry";
import type { AIMessage, TokenUsage } from "../provider/types";
import type { ZodSchema } from "zod";
import { v4 as uuidv4 } from "uuid";

/**
 * Standard client access point coordinating context mapping and pipeline execution.
 * Consolidates prompt loading, message parsing, validation retries, and telemetry metrics.
 */
export class ExecutionFacade {
  private readonly defaultPipeline = new ExecutionPipeline()
    .use(new RateLimiterMiddleware())
    .use(new MetricsMiddleware())
    .use(new JsonSelfHealingMiddleware())
    .use(new TelemetryLoggingMiddleware());

  /**
   * Retrieves the pre-configured baseline execution pipeline.
   */
  getPipeline(): ExecutionPipeline {
    return this.defaultPipeline;
  }

  /**
   * Primary entry point to execute requests with pre-configured policies and middlewares.
   */
  async execute<T = any>(params: {
    readonly scope: AIConfigScope;
    readonly promptName?: string;
    readonly promptVersion?: string;
    readonly input?: Record<string, any>;
    readonly messages?: AIMessage[];
    readonly context?: Partial<AIContext>;
    readonly responseFormat: "text" | "json";
    readonly defaultModel: string;
    readonly schema?: ZodSchema<T>;
    readonly modelOverride?: string;
    readonly temperatureOverride?: number;
    readonly maxTokensOverride?: number;
    readonly signal?: AbortSignal;
    readonly timeoutMsOverride?: number;
    readonly pipeline?: ExecutionPipeline;
    readonly tools?: string[];
  }): Promise<ExecutionResult<T>> {
    const config = aiConfigCenter.get(params.scope);
    const policy = policyRegistry.get(params.scope);

    let messages: AIMessage[];
    let promptVersion = params.promptVersion || "";

    if (params.promptName) {
      promptVersion = params.promptVersion || promptRegistry.getActiveVersion(params.promptName);
      const promptDef = await promptRegistry.get(params.promptName, promptVersion);

      const contextObj = new AIContextCollector()
        .fromObject(params.context || {})
        .build();
      const contextMarkdown = AIContextCollector.formatToMarkdown(contextObj);

      const builder = new PromptBuilder()
        .role(promptDef.system || "You are a helpful AI assistant.")
        .context(contextMarkdown)
        .userInput(promptDef.user);

      if (promptDef.metadata?.constraints) {
        builder.constraint(promptDef.metadata.constraints);
      }

      const { system, user } = builder.build(params.input || {});
      messages = [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ];
    } else if (params.messages) {
      messages = params.messages;
    } else {
      throw new Error("Either promptName or messages must be provided to execute.");
    }

    const resolvedModel = params.modelOverride || config.model || params.defaultModel;

    // Policy Validation: Check allowed models
    const isModelAllowed = policy.allowedModels.some(
      (m) => m === resolvedModel || resolvedModel.startsWith(m)
    );
    if (!isModelAllowed) {
      throw new Error(
        `[PolicyViolation] Model "${resolvedModel}" is not allowed by policy "${policy.name}". ` +
        `Allowed models: ${policy.allowedModels.join(", ")}`
      );
    }

    // Policy Validation: Streaming restriction checks
    if (params.responseFormat === "json" && !policy.allowStreaming && config.stream) {
      throw new Error(`[PolicyViolation] Streaming is disabled by policy "${policy.name}" for scope "${params.scope}".`);
    }

    const resolvedTemperature = params.temperatureOverride !== undefined
      ? params.temperatureOverride
      : (policy.temperatureOverride !== undefined ? policy.temperatureOverride : config.temperature);

    const resolvedMaxTokens = params.maxTokensOverride !== undefined
      ? params.maxTokensOverride
      : config.maxTokens;

    const context = new ExecutionContextContainer({
      id: uuidv4(),
      scope: params.scope,
      promptName: params.promptName || "custom",
      promptVersion,
      input: params.input || {},
      messages,
      ...(params.schema !== undefined && { schema: params.schema }),
      startTime: Date.now(),
      tools: params.tools,
    });

    context.responseFormat = params.responseFormat;
    context.model = resolvedModel;
    context.temperature = resolvedTemperature;
    context.maxOutputTokens = resolvedMaxTokens;
    context.signal = params.signal;
    context.policy = policy;

    const runner = params.pipeline || this.defaultPipeline;
    return await runner.run<T>(context);
  }

  /**
   * Executes requests as a stream, yielding string chunks.
   * Telemetry logs are dispatched cleanly on complete or error lifecycle states.
   */
  async *executeStream(params: {
    readonly scope: AIConfigScope;
    readonly promptName: string;
    readonly promptVersion?: string;
    readonly input: Record<string, any>;
    readonly context?: Partial<AIContext>;
    readonly defaultModel: string;
    readonly modelOverride?: string;
    readonly temperatureOverride?: number;
    readonly maxTokensOverride?: number;
    readonly signal?: AbortSignal;
  }): AsyncGenerator<string, TokenUsage, undefined> {
    const config = aiConfigCenter.get(params.scope);
    const provider = providerRegistry.getDefault();
    const startTime = Date.now();

    const promptVersion = params.promptVersion || promptRegistry.getActiveVersion(params.promptName);
    const promptDef = await promptRegistry.get(params.promptName, promptVersion);

    const contextObj = new AIContextCollector()
      .fromObject(params.context || {})
      .build();
    const contextMarkdown = AIContextCollector.formatToMarkdown(contextObj);

    const builder = new PromptBuilder()
      .role(promptDef.system || "You are a helpful AI assistant.")
      .context(contextMarkdown)
      .userInput(promptDef.user);

    if (promptDef.metadata?.constraints) {
      builder.constraint(promptDef.metadata.constraints);
    }

    const { system, user } = builder.build(params.input);
    const messages: AIMessage[] = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];

    const providerOptions = {
      model: params.modelOverride || config.model || params.defaultModel,
      ...(promptDef.metadata?.temperature !== undefined && { temperature: promptDef.metadata.temperature }),
      ...(promptDef.metadata?.maxTokens !== undefined && { maxOutputTokens: promptDef.metadata.maxTokens }),
      ...(params.signal !== undefined && { signal: params.signal }),
    };

    let totalText = "";
    let usage: TokenUsage | undefined;

    const iterator = provider.stream(messages, providerOptions);

    try {
      while (true) {
        const { value, done } = await iterator.next();
        if (done) {
          usage = value as TokenUsage;
          break;
        }
        totalText += value;
        yield value;
      }

      await aiLogger.log({
        providerId: provider.id,
        model: providerOptions.model || params.defaultModel,
        prompt: { system, messages: [{ role: "user", content: user }] },
        durationMs: Date.now() - startTime,
        response: totalText,
        ...(usage !== undefined && { usage }),
        promptName: params.promptName,
        promptVersion,
      });

      return usage!;
    } catch (err: any) {
      await aiLogger.log({
        providerId: provider.id,
        model: providerOptions.model || params.defaultModel,
        prompt: { system, messages: [{ role: "user", content: user }] },
        durationMs: Date.now() - startTime,
        error: err,
        promptName: params.promptName,
        promptVersion,
      });

      throw err;
    }
  }
}

export const aiExecutionFacade = new ExecutionFacade();
