import { BaseAgent } from "./base.agent";
import { editorCopilot } from "./copilot.agent";
import { ReviewInput, ReviewOutput } from "./copilot.schema";
import type { AgentOptions, AgentResult } from "./types";

// =============================================================================
//  REVIEW AGENT
//  ai/agent/review.agent.ts
//
//  Design Decisions:
//  - Inherits from BaseAgent to remain compatible with standard agent structures.
//  - Reuses the unified EditorCopilot engine to avoid duplication of prompt templates,
//    input schema parsing, output validation, and provider calls.
// =============================================================================

export class ReviewAgent extends BaseAgent<ReviewInput, ReviewOutput> {
  readonly name = "ReviewAgent";
  protected readonly promptName = "review";
  protected override readonly responseFormat = "json";
  protected override readonly defaultModel = "quality";

  /**
   * Delegates the article review request directly to the central EditorCopilot engine,
   * checking for grammar, readability, and content completions.
   */
  override async execute(
    input: ReviewInput,
    options: AgentOptions = {}
  ): Promise<AgentResult<ReviewOutput>> {
    return editorCopilot.execute("review", input, options);
  }
}

export const reviewAgent = new ReviewAgent();
