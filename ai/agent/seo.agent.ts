// =============================================================================
//  AI AGENT — SEO METADATA & OPTIMIZATION
//  ai/agent/seo.agent.ts
//
//  Design Decisions:
//  - Analyzes article content to generate description, slug, keywords, and outline revisions.
//  - Encapsulated output validation using Zod.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { z } from "zod";

export const SeoAgentOutputSchema = z.object({
  metaDescription: z.string(),
  slug: z.string(),
  primaryKeyword: z.string(),
  lsiKeywords: z.array(z.string()),
  seoScore: z.number().int().min(0).max(100),
  headingSuggestions: z.array(z.string()),
});

export type SeoAgentOutput = z.infer<typeof SeoAgentOutputSchema>;

export interface SeoAgentInput {
  readonly title: string;
  readonly content: string;
  readonly targetKeyword?: string;
}

export class SeoAgent extends BaseAgent<SeoAgentInput, SeoAgentOutput> {
  readonly name = "SeoAgent";
  protected readonly promptName = "seo";
  protected override readonly responseFormat = "json";
  protected override readonly defaultModel = "quality";
  protected override readonly schema = SeoAgentOutputSchema;

  protected override async validate(data: SeoAgentOutput): Promise<boolean> {
    return (
      typeof data.metaDescription === "string" &&
      typeof data.slug === "string" &&
      Array.isArray(data.lsiKeywords) &&
      data.seoScore >= 0
    );
  }
}

export const seoAgent = new SeoAgent();
