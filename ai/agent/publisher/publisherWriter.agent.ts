import { BaseAgent } from "../base.agent";
import type { PublisherPlan } from "./publisherPlanner.schema";
import { ContentStructureService, type ArticleBlock } from "../../content/contentStructure.service";
import type { AgentOptions, AgentResult } from "../types";

export interface PublisherWriterInput extends Record<string, any> {
  readonly plan: PublisherPlan;
  readonly additionalInstructions?: string;
}

export interface PublisherWriterOutput {
  readonly blocks: ArticleBlock[];
  readonly wordCount: number;
  readonly rawMarkdown: string;
  readonly contentVersion: "blocks-v1";
}

export class PublisherWriterAgent extends BaseAgent<PublisherWriterInput, any> {
  readonly name = "PublisherWriterAgent";
  protected readonly defaultModel = "quality";
  protected readonly promptName = "publisher-writer";
  protected readonly responseFormat = "text";

  override async execute(
    input: PublisherWriterInput,
    options: AgentOptions = {}
  ): Promise<AgentResult<PublisherWriterOutput>> {
    // 1. Call model execution façade (returns raw markdown text)
    const result = await super.execute(
      {
        plan: JSON.stringify(input.plan, null, 2),
        additionalInstructions: input.additionalInstructions || "",
      },
      options
    );

    const rawMarkdown: string = typeof result.data === "string" ? result.data : (result.data?.markdown || "");
    
    // 2. Convert markdown into blocks-v1 JSON structure
    const structured = ContentStructureService.buildArticleStructure({ markdown: rawMarkdown });
    const wordCount = rawMarkdown.split(/\s+/).filter(Boolean).length;

    const output: PublisherWriterOutput = {
      blocks: structured.blocks,
      wordCount,
      rawMarkdown,
      contentVersion: "blocks-v1",
    };

    return {
      success: true,
      data: output,
      ...(result.tokenUsage !== undefined && { tokenUsage: result.tokenUsage }),
      executionTimeMs: result.executionTimeMs,
      estimatedCost: result.estimatedCost,
    };
  }

  protected override async validate(markdown: any): Promise<boolean> {
    const text = typeof markdown === "string" ? markdown : (markdown?.markdown || "");
    return text.trim().length > 100;
  }
}
