import { BaseAgent } from "./base.agent";
import { editorCopilot } from "./copilot.agent";
import { ImproveInput, ImproveOutput } from "./copilot.schema";
import type { AgentOptions, AgentResult } from "./types";

// =============================================================================
//  IMPROVE AGENT
//  ai/agent/improve.agent.ts
//
//  Design Decisions:
//  - Inherits from BaseAgent to remain compatible with standard agent structures.
//  - Reuses the unified EditorCopilot engine to avoid duplication of prompt templates,
//    input schema parsing, output validation, and provider calls.
// =============================================================================

export class ImproveAgent extends BaseAgent<ImproveInput, ImproveOutput> {
  readonly name = "ImproveAgent";
  protected readonly promptName = "improve";
  protected override readonly responseFormat = "json";
  protected override readonly defaultModel = "fast";

  /**
   * Delegates the rewrite request directly to the central EditorCopilot engine,
   * satisfying formatting, accuracy preservation, and readability instructions.
   */
  override async execute(
    input: ImproveInput,
    options: AgentOptions = {}
  ): Promise<AgentResult<ImproveOutput>> {
    return editorCopilot.execute("improve", input, options);
  }
}

export const improveAgent = new ImproveAgent();
