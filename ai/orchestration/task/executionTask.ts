// =============================================================================
//  AI ORCHESTRATION PLATFORM — EXECUTION INTEGRATION TASK
//  ai/orchestration/task/executionTask.ts
//
//  Design Decisions:
//  - Implements OrchestratedTask.
//  - Conforms to clean separation: delegates execution directly to the
//    Execution Platform via the facade.
//  - No AI logic or code inside the task definition itself.
//  - Converts ExecutionResult data into type-safe task results.
// =============================================================================

import type { ZodSchema } from "zod";
import type { OrchestratedTask, RetryPolicy } from "../contracts";
import type { AIConfigScope } from "../../config";
import { aiExecutionFacade } from "../../execution/facade";

export interface ExecutionTaskParams<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly scope: AIConfigScope;
  readonly promptName: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  readonly defaultRetryPolicy: RetryPolicy;
  readonly defaultModel?: string;
  readonly responseFormat?: "text" | "json";
}

/**
 * Reusable task implementation that delegates LLM prompt runs to the
 * Execution Platform via the ExecutionFacade.
 */
export class ExecutionTask<TInput = any, TOutput = any> implements OrchestratedTask<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly scope: AIConfigScope;
  readonly promptName: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  readonly defaultRetryPolicy: RetryPolicy;
  readonly defaultModel: string;
  readonly responseFormat: "text" | "json";

  constructor(params: ExecutionTaskParams<TInput, TOutput>) {
    this.id = params.id;
    this.name = params.name;
    this.description = params.description;
    this.version = params.version;
    this.scope = params.scope;
    this.promptName = params.promptName;
    this.inputSchema = params.inputSchema;
    this.outputSchema = params.outputSchema;
    this.defaultRetryPolicy = params.defaultRetryPolicy;
    this.defaultModel = params.defaultModel ?? "gemini-2.5-flash";
    this.responseFormat = params.responseFormat ?? "json";
  }

  async execute(
    input: TInput,
    _context: Readonly<Record<string, any>>,
    signal?: AbortSignal
  ): Promise<TOutput> {
    const result = await aiExecutionFacade.execute<TOutput>({
      scope: this.scope,
      promptName: this.promptName,
      input: input as Record<string, any>,
      responseFormat: this.responseFormat,
      defaultModel: this.defaultModel,
      schema: this.outputSchema,
      ...(signal !== undefined && { signal }),
    });

    if (!result.success) {
      throw result.error ?? new Error(`[ExecutionTask] Prompt "${this.promptName}" execution failed.`);
    }

    if (result.data === undefined) {
      throw new Error(`[ExecutionTask] Prompt "${this.promptName}" output is undefined.`);
    }

    return result.data;
  }
}
