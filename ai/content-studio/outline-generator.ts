// =============================================================================
//  AI CONTENT STUDIO — OUTLINE GENERATOR SERVICE
//  ai/content-studio/outline-generator.ts
//
//  Design Decisions:
//  - Transforms a chosen idea and structured content brief into a deep,
//    logically sequenced ContentOutline with introduction, sections, and FAQ.
//  - Delegates execution to the centralized AI Execution Facade with prompt
//    versioning and zod validation.
//  - Gracefully falls back to providerRegistry when prompt templates are unavailable.
// =============================================================================

import { aiExecutionFacade } from "../execution";
import { providerRegistry } from "../provider";
import {
  ContentOutlineSchema,
  OutlineGeneratorInputSchema,
  type ContentOutline,
  type OutlineGeneratorInput,
} from "./schemas";
import {
  CONTENT_STUDIO_OUTLINE_PROMPT_NAME,
  CONTENT_STUDIO_OUTLINE_PROMPT_ACTIVE_VERSION,
} from "./prompts";

export class OutlineGeneratorService {
  /**
   * Generates a comprehensive, logically sequenced content outline.
   */
  async generateOutline(
    input: OutlineGeneratorInput,
    options: { userId?: string } = {}
  ): Promise<ContentOutline> {
    const validated = OutlineGeneratorInputSchema.parse(input);
    const { idea, contentBrief } = validated;

    try {
      const facadeResult = await aiExecutionFacade.execute<ContentOutline>({
        featureId: "content_studio_outline",
        userId: options.userId,
        prompt: {
          name: CONTENT_STUDIO_OUTLINE_PROMPT_NAME,
          version: CONTENT_STUDIO_OUTLINE_PROMPT_ACTIVE_VERSION,
          variables: {
            title: idea.title,
            hook: idea.hook,
            contentType: idea.contentType,
            category: idea.category,
            keywords: (idea.keywords || []).join(", "),
            searchIntent: idea.searchIntent,
            targetAudience: (contentBrief.targetAudience || []).join(", "),
            tone: contentBrief.tone,
            length: contentBrief.length,
            objective: contentBrief.objective,
          },
        },
      });

      if (facadeResult.data && Array.isArray(facadeResult.data.sections)) {
        return facadeResult.data;
      }
    } catch (err: any) {
      console.warn(
        `[OutlineGeneratorService] Facade execution failed (${err.message}), falling back to direct provider call:`
      );
    }

    return this.fallbackDirectGeneration(idea, contentBrief);
  }

  private async fallbackDirectGeneration(
    idea: any,
    brief: any
    let provider;
    try {
      provider = providerRegistry.getDefault();
    } catch {
      throw new Error("No AI provider registered in providerRegistry");
    }

    const systemPrompt = `You are an expert technical editorial director and SEO content architect for OpenIdear.
Generate a structured, high-value content outline based on the idea and brief.
Return ONLY valid JSON matching:
{
  "title": "string",
  "introduction": "string",
  "sections": [
    {
      "id": "string",
      "heading": "string",
      "purpose": "string",
      "keyPoints": ["string", "string", "string"]
    }
  ],
  "conclusion": "string",
  "faq": [
    {
      "question": "string",
      "answerDirection": "string"
    }
  ]
}`;

    const userPrompt = `Title: ${idea.title}
Hook: ${idea.hook}
Content Type: ${idea.contentType}
Category: ${idea.category}
Search Intent: ${idea.searchIntent}
Target Audience: ${(brief.targetAudience || []).join(", ")}
Tone: ${brief.tone}
Length: ${brief.length}
Objective: ${brief.objective}`;

    const response = await provider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 4000,
    });

    const text = response.content || "{}";
    const cleanJson = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanJson);
  }
}

export const outlineGeneratorService = new OutlineGeneratorService();
