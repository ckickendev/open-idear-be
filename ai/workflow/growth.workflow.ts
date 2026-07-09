import { Workflow } from "./executor";
import { GrowthContextBuilder } from "../context";
import { growthEngine, GrowthEngine } from "./growthEngine";
import type { GrowthTaskResult } from "./growthTask.registry";
import type { AgentOptions } from "../agent/types";

/**
 * =============================================================================
 *  GROWTH WORKFLOW
 *  ai/workflow/growth.workflow.ts
 *
 *  Design Decisions:
 *  - Specialized workflow coordinating value-expansion growth tasks for posts.
 *  - Validates inputs, compiles strongly typed GrowthContext, and routes
 *    execution through the GrowthEngine.
 *  - Runs tasks concurrently in parallel promises to minimize response latency.
 *  - Completely decoupled from LLM providers (provider-agnostic).
 * =============================================================================
 */

export interface GrowthWorkflowInput {
  readonly postId: string;
  readonly userId: string;
  readonly tasks: string[];
  readonly post: {
    readonly title?: string;
    readonly content?: string;
    readonly category?: string;
    readonly audience?: string;
    readonly tone?: string;
    readonly tags?: string[];
    readonly metadata?: any;
    readonly seo?: any;
    readonly plannerOutput?: any;
    readonly writerOutput?: any;
  };
}

export class GrowthWorkflow extends Workflow<GrowthWorkflowInput, Record<string, GrowthTaskResult>> {
  private readonly engine: GrowthEngine;

  /**
   * @param engine Injected GrowthEngine instance (Dependency Injection).
   */
  constructor(engine?: GrowthEngine) {
    super();
    this.engine = engine || growthEngine;
  }

  /**
   * Coordinates the validation, context loading, and execution of content growth tasks.
   */
  override async execute(
    initialInput: GrowthWorkflowInput,
    options: AgentOptions = {}
  ): Promise<Record<string, GrowthTaskResult>> {
    const { postId, userId, tasks, post } = initialInput;

    // 1. Validate request parameters
    if (!postId) {
      throw new Error("GrowthWorkflow failed: postId is required.");
    }
    if (!userId) {
      throw new Error("GrowthWorkflow failed: userId is required.");
    }
    if (!tasks || tasks.length === 0) {
      throw new Error("GrowthWorkflow failed: tasks list is required.");
    }
    if (!post) {
      throw new Error("GrowthWorkflow failed: post payload is required.");
    }

    // 2. Build growth context block
    const contextBuilder = new GrowthContextBuilder()
      .articleTitle(post.title || "")
      .markdown(post.content || "")
      .audience(post.audience || "")
      .tone(post.tone || "")
      .category(post.category || "");

    if (post.tags) contextBuilder.tags(post.tags);
    if (post.metadata) contextBuilder.metadata(post.metadata);
    if (post.seo) contextBuilder.seo(post.seo);
    if (post.plannerOutput) contextBuilder.plannerOutput(post.plannerOutput);
    if (post.writerOutput) contextBuilder.writerOutput(post.writerOutput);

    const growthContext = contextBuilder.build();

    // 3. Delegate execution to GrowthEngine concurrently
    const results: Record<string, GrowthTaskResult> = {};

    const promises = tasks.map(async (taskId) => {
      options.signal?.throwIfAborted();
      const result = await this.engine.executeTask(
        taskId,
        post,
        {
          postId,
          userId,
          ...(options.signal !== undefined && { signal: options.signal }),
        },
        {
          ...options,
          context: growthContext,
        }
      );
      results[taskId] = result;
    });

    await Promise.all(promises);

    // 4. Return structured results
    return results;
  }
}
export type UseGrowthWorkflowReturn = ReturnType<GrowthWorkflow["execute"]>;
