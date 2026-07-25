// =============================================================================
//  AI AGENT — PUBLISHER READINESS REPORT
//  ai/agent/publisher.agent.ts
//
//  Design Decisions:
//  - Performs the final publish-readiness verification checks on metadata & content.
//  - Encapsulated output validation using Zod.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { z } from "zod";

export const PublisherAgentOutputSchema = z.object({
  isReady: z.boolean(),
  missingFields: z.array(z.string()),
  excerpt: z.string(),
  coverAltText: z.string().optional(),
  warnings: z.array(z.string()),
});

export type PublisherAgentOutput = z.infer<typeof PublisherAgentOutputSchema>;

export interface PublisherAgentInput {
  readonly postId: string;
  readonly draft: string;
  readonly seoData: Record<string, any>;
  readonly coverImage?: string;
}

export class PublisherAgent extends BaseAgent<PublisherAgentInput, PublisherAgentOutput> {
  readonly name = "PublisherAgent";
  protected readonly promptName = "publisher";
  protected override readonly responseFormat = "json";
  protected override readonly defaultModel = "quality";
  protected override readonly schema = PublisherAgentOutputSchema;

  protected override async validate(data: PublisherAgentOutput): Promise<boolean> {
    return typeof data.isReady === "boolean" && Array.isArray(data.missingFields) && typeof data.excerpt === "string";
  }
}

export const publisherAgent = new PublisherAgent();
