// =============================================================================
//  AI AGENT — IMAGE INTELLIGENCE
//  ai/agent/image.agent.ts
//
//  Design Decisions:
//  - Suggests new images section-by-section or generates alt text/captions for existing images.
//  - Encapsulated output validation using Zod.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { z } from "zod";

export const ImageSuggestionSchema = z.object({
  sectionTitle: z.string(),
  prompt: z.string(),
  rationale: z.string(),
  aspectRatio: z.string().optional(),
});

export const ImageAnalysisSchema = z.object({
  mediaId: z.string(),
  altText: z.string(),
  caption: z.string(),
  tags: z.array(z.string()),
});

export const ImageAgentOutputSchema = z.object({
  suggestions: z.array(ImageSuggestionSchema),
  analyses: z.array(ImageAnalysisSchema),
});

export type ImageAgentOutput = z.infer<typeof ImageAgentOutputSchema>;

export interface ImageAgentInput {
  readonly outline?: any;
  readonly images?: Array<{ id: string; url: string }>;
  readonly mode: "suggest" | "analyze";
}

export class ImageAgent extends BaseAgent<ImageAgentInput, ImageAgentOutput> {
  readonly name = "ImageAgent";
  protected readonly promptName = "image";
  protected override readonly responseFormat = "json";
  protected override readonly defaultModel = "fast";
  protected override readonly schema = ImageAgentOutputSchema;

  protected override async validate(data: ImageAgentOutput): Promise<boolean> {
    return Array.isArray(data.suggestions) && Array.isArray(data.analyses);
  }
}

export const imageAgent = new ImageAgent();
