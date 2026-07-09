import { BaseAgent } from "../agent/base.agent";
import { growthTaskRegistry, type GrowthTask, type GrowthTaskResult, type GrowthTaskContext } from "./growthTask.registry";
import { ZodSchema } from "zod";
import { AgentOptions } from "../agent/types";

/**
 * =============================================================================
 *  GROWTH ENGINE
 *  ai/workflow/growthEngine.ts
 *
 *  Design Decisions:
 *  - Orchestrates task execution for article value-expansion.
 *  - Reuses BaseAgent to perform prompt templates loading, context collecting,
 *    AI provider completions (generateJSON), validation, and telemetry cost logging.
 *  - Prevents code duplication by subclassing BaseAgent transiently for AI tasks.
 *  - Promotes concurrent task execution using Promise.all to minimize response times.
 * =============================================================================
 */

class GrowthTaskAgent extends BaseAgent {
  readonly name = "GrowthTaskAgent";
  protected readonly promptName: string;
  protected readonly responseFormat = "json";
  protected readonly defaultModel = "quality";
  protected readonly schema?: ZodSchema<any>;

  constructor(task: GrowthTask) {
    super();
    this.promptName = task.id;
    this.schema = task.outputSchema;
  }
}

export class GrowthEngine {
  /**
   * Executes a single registered growth task.
   */
  async executeTask(
    taskId: string,
    post: any,
    context: GrowthTaskContext,
    options: AgentOptions = {}
  ): Promise<GrowthTaskResult> {
    const task = growthTaskRegistry.get(taskId);
    const agent = new GrowthTaskAgent(task);

    // Build the input parameters for prompt variables
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
          outputData: {},
          errorMessage: `Growth task "${task.name}" failed during execution.`,
        };
      }

      return {
        taskId,
        success: true,
        outputData: result.data,
      };
    } catch (error: any) {
      return {
        taskId,
        success: false,
        outputData: {},
        errorMessage: error.message || `An error occurred while executing task "${task.name}".`,
      };
    }
  }

  /**
   * Executes all registered growth tasks concurrently and returns aggregated report.
   */
  async executeAll(
    post: any,
    context: GrowthTaskContext,
    options: AgentOptions = {}
  ): Promise<Record<string, GrowthTaskResult>> {
    const tasks = growthTaskRegistry.list();

    // Run all tasks concurrently in parallel requests to minimize latency
    const promises = tasks.map(async (task) => {
      context.signal?.throwIfAborted();
      return await this.executeTask(task.id, post, context, options);
    });

    const resultsList = await Promise.all(promises);

    const results: Record<string, GrowthTaskResult> = {};
    for (const result of resultsList) {
      results[result.taskId] = result;
    }

    return results;
  }
}

export const growthEngine = new GrowthEngine();
