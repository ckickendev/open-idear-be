// =============================================================================
//  AI AGENT — BASE CLASS
//  ai/agent/base.agent.ts
//
//  Design Decisions:
//  - Implements orchestrations (Load Prompt, Build Context, Call Provider,
//    Validate Output, and Log Metrics) in a unified template method `execute()`.
//  - Subclasses (Planner, Writer, SEO, etc.) inherit this execution pipeline and
//    only need to define their prompt name, model defaults, and output format.
//  - Provider-agnostic. Calls whatever provider is active in the providerRegistry.
//  - Gracefully wraps error telemetry: every failure is logged to aiLogger
//    before the error is propagated.
// =============================================================================

import { providerRegistry } from "../provider";
import { promptRegistry, PromptBuilder } from "../prompt";
import { AIContextCollector } from "../context";
import { aiLogger } from "../telemetry";
import type { AgentOptions, AgentResult } from "./types";
import type { AIMessage, CompletionOptions } from "../provider/types";

export abstract class BaseAgent<TInput extends Record<string, any> = Record<string, any>, TOutput = any> {
  /** Unique name of this agent (e.g., "PlannerAgent") */
  public abstract readonly name: string;
  /** Semantic model alias default (e.g., "fast" or "quality") */
  protected abstract readonly defaultModel: string;
  /** Name of the prompt file in filesystem (e.g., "planner") */
  protected abstract readonly promptName: string;
  /** Expected format of the model output */
  protected abstract readonly responseFormat: "text" | "json";

  /**
   * Run the agent execution flow.
   *
   * @param input   Custom variables passed to fill the user prompt template.
   * @param options Execution settings (prompt overrides, target context, signals).
   */
  async execute(input: TInput, options: AgentOptions = {}): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();

    // 1. Resolve Provider
    const provider = providerRegistry.getDefault();

    // 2. Load Prompt from filesystem version registry
    const promptVersion = options.promptVersionOverride || promptRegistry.getActiveVersion(this.promptName);
    const promptDef = await promptRegistry.get(this.promptName, promptVersion);

    // 3. Build Context Block
    const context = new AIContextCollector()
      .fromObject(options.context || {})
      .build();
    const contextMarkdown = AIContextCollector.formatToMarkdown(context);

    // 4. Assemble Prompt Payload via PromptBuilder
    // System instructions are loaded from the registry template, enriched with target contexts.
    const builder = new PromptBuilder()
      .role(promptDef.system || "You are a helpful AI assistant.")
      .context(contextMarkdown)
      .userInput(promptDef.user);

    // If metadata has custom constraints or rules, inject them into the builder
    if (promptDef.metadata?.constraints) {
      builder.constraint(promptDef.metadata.constraints);
    }

    const { system, user } = builder.build(input);
    const messages: AIMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    const providerOptions: CompletionOptions = {
      model: options.modelOverride || this.defaultModel,
      ...(promptDef.metadata?.temperature !== undefined && { temperature: promptDef.metadata.temperature }),
      ...(promptDef.metadata?.maxTokens !== undefined && { maxOutputTokens: promptDef.metadata.maxTokens }),
      ...(options.signal !== undefined && { signal: options.signal }),
    };

    let resultText = "";
    let parsedData: any;
    let tokenUsage;
    let loggedEntry;

    try {
      // 5. Call Provider
      if (this.responseFormat === "json") {
        const result = await provider.generateJSON<TOutput>(messages, providerOptions);
        parsedData = result.data;
        resultText = JSON.stringify(parsedData);
        tokenUsage = result.usage;
      } else {
        const result = await provider.generate(messages, providerOptions);
        resultText = result.text;
        parsedData = resultText as unknown as TOutput;
        tokenUsage = result.usage;
      }

      // 6. Validate Output
      const isValid = await this.validate(parsedData);
      if (!isValid) {
        throw new Error(`Validation failed for ${this.name} response output.`);
      }

      const executionTimeMs = Date.now() - startTime;

      // 7. Log Telemetry (Success)
      loggedEntry = await aiLogger.log(
        provider.id,
        providerOptions.model || this.defaultModel,
        { system, messages: [{ role: "user", content: user }] },
        executionTimeMs,
        resultText,
        tokenUsage
      );

      return {
        success: true,
        data: parsedData,
        tokenUsage,
        executionTimeMs,
        estimatedCost: loggedEntry.estimatedCost || 0,
      };

    } catch (err: any) {
      const executionTimeMs = Date.now() - startTime;

      // Log Telemetry (Failure)
      loggedEntry = await aiLogger.log(
        provider.id,
        providerOptions.model || this.defaultModel,
        { system, messages: [{ role: "user", content: user }] },
        executionTimeMs,
        undefined,
        undefined,
        err
      );

      throw err;
    }
  }

  /**
   * Optional hooks for concrete agents to enforce semantic validation
   * (e.g. check arrays are not empty, strings match formats, etc.).
   *
   * Defaults to returning true. Subclasses override this to implement
   * custom business rules on output.
   */
  protected async validate(_data: TOutput): Promise<boolean> {
    return true;
  }
}
