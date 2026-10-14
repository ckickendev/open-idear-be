// =============================================================================
//  AI CONTENT STUDIO — BRIEF GENERATOR SERVICE
//  ai/content-studio/brief-generator.ts
//
//  Design Decisions:
//  - Transforms a chosen content idea into a structured editorial brief.
//  - Generates targetAudience, tone, length, category, and objective.
//  - Executes via aiExecutionFacade with prompt templates and zod validation.
// =============================================================================

import { aiExecutionFacade } from "../execution";
import { providerRegistry } from "../provider";
import {
  CONTENT_STUDIO_BRIEF_PROMPT_NAME,
  CONTENT_STUDIO_BRIEF_PROMPT_ACTIVE_VERSION,
} from "./prompts";
import {
  type ContentBrief,
  type GenerateBriefInput,
  GenerateBriefInputSchema,
} from "./schemas";

export class BriefGeneratorService {
  /**
   * Generates a structured editorial brief from a selected content idea.
   */
  async generate(
    input: GenerateBriefInput,
    options: { userId?: string } = {}
  ): Promise<ContentBrief> {
    const validated = GenerateBriefInputSchema.parse(input);
    const { idea, existingCategories } = validated;

    const categoriesHint =
      existingCategories && existingCategories.length > 0
        ? existingCategories.join(", ")
        : "None provided";

    const systemPrompt = `You are an expert editorial planner for OpenIdear. Generate a structured Content Brief for the idea provided.
Return ONLY valid JSON matching:
{
  "targetAudience": ["string", "string"],
  "tone": "Practical" | "Professional" | "Beginner-friendly" | "Technical" | "Conversational" | "Data-driven" | "Opinionated" | "Educational",
  "length": "Short — 1,000–1,500 words" | "Medium — 1,500–2,500 words" | "Long — 2,500–3,500 words" | "Deep Dive — 3,500–5,000 words",
  "category": "string",
  "objective": "Explain" | "Educate" | "Compare" | "Help users make a purchase decision" | "Solve a technical problem" | "Build topical authority" | "Generate SEO traffic"
}`;

    const userPrompt = `Title: ${idea.title}
Hook: ${idea.hook}
Content Type: ${idea.contentType}
Category: ${idea.category}
Target Audience Hint: ${idea.targetAudience}
Difficulty: ${idea.difficulty}
Search Intent: ${idea.searchIntent}
Keywords: ${(idea.keywords || []).join(", ")}
Available System Categories: ${categoriesHint}`;

    try {
      const facadeResult = await aiExecutionFacade.execute<ContentBrief>({
        scope: "content_studio",
        featureId: "content_studio_brief",
        userId: options.userId,
        responseFormat: "json",
        defaultModel: "fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      if (facadeResult.data && facadeResult.data.targetAudience) {
        return facadeResult.data;
      }
    } catch (err: any) {
      console.warn(
        `[BriefGeneratorService] Facade execution failed (${err.message}), falling back to direct provider call:`
      );
    }

    return this.fallbackDirectGeneration(idea, categoriesHint);
  }

  private async fallbackDirectGeneration(
    idea: any,
    categoriesHint: string
  ): Promise<ContentBrief> {
    let provider;
    try {
      provider = providerRegistry.getDefault();
    } catch {
      throw new Error("No AI provider registered in providerRegistry");
    }

    const systemPrompt = `You are an expert editorial planner for OpenIdear. Generate a structured Content Brief for the idea provided.
Return ONLY valid JSON matching:
{
  "targetAudience": ["string", "string"],
  "tone": "Practical" | "Professional" | "Beginner-friendly" | "Technical" | "Conversational" | "Data-driven" | "Opinionated" | "Educational",
  "length": "Short — 1,000–1,500 words" | "Medium — 1,500–2,500 words" | "Long — 2,500–3,500 words" | "Deep Dive — 3,500–5,000 words",
  "category": "string",
  "objective": "Explain" | "Educate" | "Compare" | "Help users make a purchase decision" | "Solve a technical problem" | "Build topical authority" | "Generate SEO traffic"
}`;

    const userPrompt = `Title: ${idea.title}
Hook: ${idea.hook}
Content Type: ${idea.contentType}
Category: ${idea.category}
Target Audience Hint: ${idea.targetAudience}
Difficulty: ${idea.difficulty}
Search Intent: ${idea.searchIntent}
Keywords: ${(idea.keywords || []).join(", ")}
Available System Categories: ${categoriesHint}`;

    const response = await provider.generateJSON<ContentBrief>(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.3,
        maxOutputTokens: 1500,
      }
    );

    return response.data;
  }
}

export const briefGeneratorService = new BriefGeneratorService();
