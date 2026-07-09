import { BaseAgent } from "../agent/base.agent";
import { publishTaskRegistry, type PublishTask, type PublishTaskResult, type PublishTaskContext } from "./publishTask.registry";
import { ZodSchema } from "zod";
import { AgentOptions } from "../agent/types";

/**
 * =============================================================================
 *  PUBLISHING ENGINE
 *  ai/workflow/publishingEngine.ts
 *
 *  Design Decisions:
 *  - Orchestrates task execution for preflight article validation.
 *  - Reuses BaseAgent to perform prompt templates loading, context collecting,
 *    AI provider completions (generateJSON), validation, and telemetry cost logging.
 *  - Prevents code duplication by subclassing BaseAgent transiently for AI tasks.
 * =============================================================================
 */

class PublishTaskAgent extends BaseAgent {
  readonly name = "PublishTaskAgent";
  protected readonly promptName: string;
  protected readonly responseFormat = "json";
  protected readonly defaultModel = "quality";
  protected readonly schema?: ZodSchema<any>;

  constructor(task: PublishTask) {
    super();
    this.promptName = task.id;
    this.schema = task.outputSchema;
  }
}

export class PublishingEngine {
  /**
   * Executes a single registered publishing task.
   */
  async executeTask(
    taskId: string,
    post: any,
    context: PublishTaskContext,
    options: AgentOptions = {}
  ): Promise<PublishTaskResult> {
    const task = publishTaskRegistry.get(taskId);

    // If the task runs locally without LLM prompts (e.g. metadata validator), run directly
    if (task.id === "metadata") {
      return await task.run(post, context);
    }

    // For AI-driven tasks (review, seo, category), execute the prompt completion workflow
    const agent = new PublishTaskAgent(task);
    const inputPayload = {
      title: post.title || "Untitled",
      content: post.content || "",
    };

    try {
      const result = await agent.execute(inputPayload, {
        ...(context.signal !== undefined && { signal: context.signal }),
        ...options,
      });

      if (!result.success) {
        return {
          taskId,
          success: false,
          severity: task.severity,
          message: `Publishing task "${task.name}" failed during execution.`,
        };
      }

      return {
        taskId,
        success: true,
        severity: task.severity,
        outputData: result.data,
      };
    } catch (error: any) {
      return {
        taskId,
        success: false,
        severity: task.severity,
        message: error.message || `An error occurred while executing task "${task.name}".`,
      };
    }
  }

  /**
   * Executes all registered publishing tasks for a draft post and returns aggregated report.
   */
  async executeAll(
    post: any,
    context: PublishTaskContext,
    options: AgentOptions = {}
  ): Promise<{ isReady: boolean; results: Record<string, PublishTaskResult> }> {
    const tasks = publishTaskRegistry.list();

    // Execute all validation, generation, and review checks concurrently to minimize response latency
    const promises = tasks.map(async (task) => {
      context.signal?.throwIfAborted();
      return await this.executeTask(task.id, post, context, options);
    });

    const resultsList = await Promise.all(promises);

    const results: Record<string, PublishTaskResult> = {};
    let isReady = true;

    for (const result of resultsList) {
      results[result.taskId] = result;

      // Halt publishing transition if any block validation has "error" severity
      if (!result.success && result.severity === "error") {
        isReady = false;
      }
    }

    return { isReady, results };
  }
}

export const publishingEngine = new PublishingEngine();
