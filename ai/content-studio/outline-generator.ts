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
    const { idea, contentBrief, language = "en" } = validated;

    const langLabel = language === "vi" ? "Vietnamese (Tiếng Việt)" : "English";
    const systemPrompt = `You are an expert technical editorial director and SEO content architect for OpenIdear.
Generate a structured, high-value content outline based on the idea and brief.
CRITICAL LANGUAGE REQUIREMENT:
All generated outline fields (title, introduction, section headings, purpose, keyPoints, conclusion, and FAQ questions & answer directions) MUST be written strictly in ${langLabel}.
Do NOT mix languages.
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
Target Language: ${langLabel} (ALL outline output MUST be strictly in ${langLabel})
Hook: ${idea.hook}
Content Type: ${idea.contentType}
Category: ${idea.category}
Search Intent: ${idea.searchIntent}
Target Audience: ${(contentBrief.targetAudience || []).join(", ")}
Tone: ${contentBrief.tone}
Length: ${contentBrief.length}
Objective: ${contentBrief.objective}`;

    try {
      const facadeResult = await aiExecutionFacade.execute<ContentOutline>({
        scope: "content_studio",
        featureId: "content_studio_outline",
        userId: options.userId,
        responseFormat: "json",
        defaultModel: "fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
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
  ): Promise<ContentOutline> {
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

    const response = await provider.generateJSON<ContentOutline>(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.4,
        maxOutputTokens: 4000,
      }
    );

    return response.data;
  }
}

export const outlineGeneratorService = new OutlineGeneratorService();
