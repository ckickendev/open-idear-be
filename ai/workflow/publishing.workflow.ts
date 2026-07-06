import { Workflow } from "./executor";
import { PublishingContextBuilder } from "../context";
import { publishingEngine, PublishingEngine } from "./publishingEngine";
import type { PublishTaskResult } from "./publishTask.registry";
import type { AgentOptions } from "../agent/types";

/**
 * =============================================================================
 *  PUBLISHING WORKFLOW
 *  ai/workflow/publishing.workflow.ts
 *
 *  Design Decisions:
 *  - Specialized workflow coordinating pre-publish checks for article drafts.
 *  - Validates inputs, compiles strongly typed PublishingContext, and routes
 *    execution through the PublishingEngine.
 *  - Completely decoupled from Gemini (provider-agnostic).
 * =============================================================================
 */

export interface PublishingWorkflowInput {
  readonly postId: string;
  readonly userId: string;
  readonly post: {
    readonly title?: string;
    readonly content?: string;
    readonly category?: string;
    readonly audience?: string;
    readonly goal?: string;
    readonly tone?: string;
    readonly plannerOutput?: any;
    readonly writerOutput?: any;
    readonly editorHistory?: any;
  };
}

export interface PublishPreflightReport {
  readonly isReady: boolean;
  readonly results: Record<string, PublishTaskResult>;
}

export class PublishingWorkflow extends Workflow<PublishingWorkflowInput, PublishPreflightReport> {
  private readonly engine: PublishingEngine;

  /**
   * @param engine Injected PublishingEngine instance (Dependency Injection).
   */
  constructor(engine?: PublishingEngine) {
    super();
    this.engine = engine || publishingEngine;
  }

  /**
   * Coordinates the validation, context loading, and execution of publishing preflight checks.
   */
  override async execute(
    initialInput: PublishingWorkflowInput,
    options: AgentOptions = {}
  ): Promise<PublishPreflightReport> {
    const { postId, userId, post } = initialInput;

    // 1. Validate request parameters
    if (!postId) {
      throw new Error("PublishingWorkflow failed: postId is required.");
    }
    if (!userId) {
      throw new Error("PublishingWorkflow failed: userId is required.");
    }
    if (!post) {
      throw new Error("PublishingWorkflow failed: post payload is required.");
    }

    // 2. Build publishing context block
    const contextBuilder = new PublishingContextBuilder()
      .articleTitle(post.title || "")
      .markdown(post.content || "")
      .audience(post.audience || "")
      .goal(post.goal || "")
      .tone(post.tone || "")
      .category(post.category || "");

    if (post.plannerOutput) contextBuilder.plannerOutput(post.plannerOutput);
    if (post.writerOutput) contextBuilder.writerOutput(post.writerOutput);
    if (post.editorHistory) contextBuilder.editorHistory(post.editorHistory);

    const publishingContext = contextBuilder.build();

    // 3. Delegate execution to PublishingEngine
    const report = await this.engine.executeAll(
      post,
      {
        postId,
        userId,
        ...(options.signal !== undefined && { signal: options.signal }),
      },
      {
        ...options,
        context: publishingContext,
      }
    );

    // 4. Return structured preflight report
    return report;
  }
}
export type UsePublishingWorkflowReturn = ReturnType<PublishingWorkflow["execute"]>;
