// =============================================================================
//  AI AGENT — BASE CLASS
//  ai/agent/base.agent.ts
//
//  Design Decisions:
//  - Implements orchestrations in a unified template method `execute()`.
//  - Delegates all prompt loading, context markdown building, policy checks,
//    LLM calls, pricing, retries, and telemetry to the AI Execution Platform.
//  - Subclasses only need to define prompt name, output format, and validation.
//  - Fully decoupled from AIRuntime, Telemetry, and Prompt registry.
// =============================================================================

import { aiExecutionFacade } from "../execution";
import type { AgentOptions, AgentResult } from "./types";
import type { TokenUsage } from "../provider/types";
import type { AIConfigScope } from "../config";
import type { ZodSchema } from "zod";
import { BrandVoiceService } from "../brand-voice";

export abstract class BaseAgent<TInput extends Record<string, any> = Record<string, any>, TOutput = any> {
  /** Unique name of this agent (e.g., "PlannerAgent") */
  public abstract readonly name: string;
  /** Semantic model alias default (e.g., "fast" or "quality") */
  protected abstract readonly defaultModel: string;
  /** Name of the prompt file in filesystem (e.g., "planner") */
  protected abstract readonly promptName: string;
  /** Expected format of the model output */
  protected abstract readonly responseFormat: "text" | "json";
  /** Optional Zod schema to validate generated output format */
  protected readonly schema?: ZodSchema<TOutput> | undefined;

  /**
   * Run the agent execution flow.
   *
   * @param input   Custom variables passed to fill the user prompt template.
   * @param options Execution settings (prompt overrides, target context, signals).
   */
  async execute(input: TInput, options: AgentOptions = {}): Promise<AgentResult<TOutput>> {
    const scope = this.getScope();

    const brandVoiceInstructions = BrandVoiceService.formatPromptInstructions(
      input?.brandVoice || input?.brandVoiceProfile
    );
    const enrichedInput = {
      brandVoiceInstructions,
      ...input,
    };

    const facadeResult = await aiExecutionFacade.execute<TOutput>({
      scope,
      promptName: this.promptName,
      ...(options.promptVersionOverride !== undefined && { promptVersion: options.promptVersionOverride }),
      input: enrichedInput,
      ...(options.context !== undefined && { context: options.context }),
      responseFormat: this.responseFormat,
      defaultModel: this.defaultModel,
      ...(this.schema !== undefined && { schema: this.schema }),
      ...(options.modelOverride !== undefined && { modelOverride: options.modelOverride }),
      ...(options.signal !== undefined && { signal: options.signal }),
    });

    if (!facadeResult.success) {
      throw facadeResult.error || new Error(`Agent execution failed.`);
    }

    // Validate Output Semantics (Custom Hook Validation)
    const isValid = await this.validate(facadeResult.data);
    if (!isValid) {
      throw new Error(`Validation failed for ${this.name} response output semantics.`);
    }

    return {
      success: true,
      data: facadeResult.data,
      ...(facadeResult.tokenUsage !== undefined && { tokenUsage: facadeResult.tokenUsage }),
      executionTimeMs: facadeResult.executionTimeMs,
      estimatedCost: facadeResult.estimatedCost,
    };
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

  /**
   * Run the agent execution flow as a stream, yielding individual text chunks.
   *
   * @param input   Custom variables passed to fill the user prompt template.
   * @param options Execution settings (prompt overrides, target context, signals).
   */
  async *executeStream(
    input: TInput,
    options: AgentOptions = {}
  ): AsyncGenerator<string, TokenUsage, undefined> {
    const scope = this.getScope();

    const brandVoiceInstructions = BrandVoiceService.formatPromptInstructions(
      input?.brandVoice || input?.brandVoiceProfile
    );
    const enrichedInput = {
      brandVoiceInstructions,
      ...input,
    };

    return yield* aiExecutionFacade.executeStream({
      scope,
      promptName: this.promptName,
      ...(options.promptVersionOverride !== undefined && { promptVersion: options.promptVersionOverride }),
      input: enrichedInput,
      ...(options.context !== undefined && { context: options.context }),
      defaultModel: this.defaultModel,
      ...(options.modelOverride !== undefined && { modelOverride: options.modelOverride }),
      ...(options.signal !== undefined && { signal: options.signal }),
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Automatically resolves the AIConfigScope based on agent class naming conventions.
   */
  private getScope(): AIConfigScope {
    const nameLower = this.name.toLowerCase();
    if (nameLower.includes("planner")) return "planner";
    if (nameLower.includes("writer")) return "writer";
    if (
      nameLower.includes("copilot") ||
      nameLower.includes("editor") ||
      nameLower.includes("improve") ||
      nameLower.includes("example") ||
      nameLower.includes("review")
    ) {
      return "editor";
    }
    if (nameLower.includes("publish")) return "publishing";
    if (nameLower.includes("growth")) return "growth";
    return "editor"; // Default fallback
  }
}
