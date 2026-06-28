// =============================================================================
//  WRITER AGENT
//  ai/agent/writer.agent.ts
//
//  Design Decisions:
//  - WriterAgent converts structured outlines into detailed Markdown articles.
//  - Inherits Load Prompt, Build Context, Call Provider, and Telemetry Logging
//    behaviors from BaseAgent.
//  - Leverages BaseAgent's ZodSchema validation using WriterSchema.
//  - Implements state caching for outline headings to enforce heading-preservation
//    checks inside the semantic validate hook.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { WriterSchema, type WriterOutput } from "./writer.schema";
import type { PlannerOutline } from "./planner.schema";
import type { AgentOptions, AgentResult } from "./types";

export interface WriterInput extends Record<string, any> {
  /** The generated and validated outline plan from the PlannerAgent */
  readonly plan: PlannerOutline;
  /** Custom operational or context directives */
  readonly additionalInstructions?: string;
}

export class WriterAgent extends BaseAgent<WriterInput, WriterOutput> {
  readonly name = "WriterAgent";
  protected readonly defaultModel = "quality"; // Writing quality reasoning maps to the quality model alias
  protected readonly promptName = "writer";
  protected readonly responseFormat = "json";
  protected override readonly schema = WriterSchema;

  private currentOutlineHeadings: string[] = [];

  /**
   * Overrides execute to capture the target outline headings before execution
   * so they are available to the validate hook.
   */
  override async execute(
    input: WriterInput,
    options: AgentOptions = {}
  ): Promise<AgentResult<WriterOutput>> {
    this.currentOutlineHeadings = input.plan.outline.map((item) =>
      item.title.toLowerCase().trim()
    );
    return super.execute(input, options);
  }

  /**
   * Validates that all planned outline headings exist in the generated markdown text.
   * Static and pure for easy unit testing without instantiating full agent classes.
   */
  public static verifyHeadingPreservation(markdown: string, headings: string[]): boolean {
    if (!markdown || markdown.trim().length === 0) {
      console.error("[WriterAgent] Heading verification failed: markdown content is empty.");
      return false;
    }

    const lowerMarkdown = markdown.toLowerCase();
    for (const heading of headings) {
      if (!lowerMarkdown.includes(heading)) {
        console.error(
          `[WriterAgent] Heading structure check failed: generated content is missing planned heading "${heading}".`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Enforces semantic verification: markdown must not be empty, and all
   * planned outline headings must exist inside the generated markdown.
   */
  protected override async validate(data: WriterOutput): Promise<boolean> {
    return WriterAgent.verifyHeadingPreservation(data.markdown, this.currentOutlineHeadings);
  }
}
