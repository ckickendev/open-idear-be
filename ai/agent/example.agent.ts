import { BaseAgent } from "./base.agent";
import { editorCopilot } from "./copilot.agent";
import { ExampleInput, ExampleOutput } from "./copilot.schema";
import type { AgentOptions, AgentResult } from "./types";

// =============================================================================
//  EXAMPLE AGENT
//  ai/agent/example.agent.ts
//
//  Design Decisions:
//  - Inherits from BaseAgent to remain compatible with standard agent structures.
//  - Reuses the unified EditorCopilot engine to avoid duplication of prompt templates,
//    input schema parsing, output validation, and provider calls.
// =============================================================================

export class ExampleAgent extends BaseAgent<ExampleInput, ExampleOutput> {
  readonly name = "ExampleAgent";
  protected readonly promptName = "example";
  protected override readonly responseFormat = "text";
  protected override readonly defaultModel = "fast";

  /**
   * Delegates the example generation request directly to the central EditorCopilot engine,
   * satisfying topic, audience, and section relevance criteria.
   */
  override async execute(
    input: ExampleInput,
    options: AgentOptions = {}
  ): Promise<AgentResult<ExampleOutput>> {
    return editorCopilot.execute("example", input, options);
  }
}

export const exampleAgent = new ExampleAgent();
