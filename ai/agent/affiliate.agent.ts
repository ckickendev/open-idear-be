// =============================================================================
//  AI AGENT — AFFILIATE LINK SUGGESTION
//  ai/agent/affiliate.agent.ts
//
//  Scans article content and identifies opportunities for affiliate link
//  insertion based on mentioned products, services, or topics.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { z } from "zod";

export const AffiliateSchema = z.object({
  suggestions: z.array(z.object({
    anchorText: z.string(),
    position: z.string(),
    category: z.string(),
    rationale: z.string(),
  })),
});

export type AffiliateOutput = z.infer<typeof AffiliateSchema>;

export interface AffiliateInput {
  readonly content: string;
  readonly affiliateCategories: string[];
  readonly existingLinks?: string[];
}

export class AffiliateAgent extends BaseAgent<AffiliateInput, AffiliateOutput> {
  public readonly name = "AffiliateAgent";
  protected readonly defaultModel = "fast";
  protected readonly promptName = "affiliate";
  protected readonly responseFormat = "json" as const;
  protected readonly schema = AffiliateSchema;

  protected async validate(data: AffiliateOutput): Promise<boolean> {
    return Array.isArray(data.suggestions);
  }
}

export const affiliateAgent = new AffiliateAgent();
