// =============================================================================
//  AI CONTENT STUDIO — IDEA GENERATOR SERVICE
//  ai/content-studio/idea-generator.ts
//
//  Design Decisions:
//  - Leverages existing inventory intelligence to generate diverse, non-duplicate ideas.
//  - Executes via aiExecutionFacade with prompt templates and zod validation.
//  - Attaches duplicate risk assessment and content relationships to each idea.
// =============================================================================

import { aiExecutionFacade } from "../execution";
import { providerRegistry } from "../provider";
import {
  CONTENT_STUDIO_IDEAS_PROMPT_NAME,
  CONTENT_STUDIO_IDEAS_PROMPT_ACTIVE_VERSION,
} from "./prompts";
import {
  type ContentIdea,
  type ContentIntelligence,
  type GenerateIdeasInput,
  GenerateIdeasInputSchema,
} from "./schemas";
import {
  contentInventoryService,
  type ArticleInventorySummary,
} from "./content-inventory.service";

export interface GenerateIdeasResult {
  ideas: ContentIdea[];
  intelligence: ContentIntelligence;
}

export class IdeaGeneratorService {
  /**
   * Generates structured, diverse content ideas informed by inventory intelligence.
   */
  async generate(
    input: GenerateIdeasInput,
    options: { userId?: string } = {}
  ): Promise<GenerateIdeasResult> {
    const validated = GenerateIdeasInputSchema.parse(input);
    const { topic, contentGoal, numberOfIdeas, existingCategories } = validated;

    // 1. Inspect existing published inventory
    const inventoryResult = await contentInventoryService.inspectInventory(topic);
    const { matchedArticles, intelligence } = inventoryResult;

    // 2. Prepare prompt execution variables
    const existingTitlesText =
      matchedArticles.length > 0
        ? matchedArticles.map((a) => `- ${a.title} (${a.category || "General"})`).join("\n")
        : "None (new topic area)";

    const categoriesHint =
      existingCategories && existingCategories.length > 0
        ? existingCategories.join(", ")
        : inventoryResult.allCategories.join(", ") || "General";

    let rawIdeas: ContentIdea[] = [];

    try {
      const facadeResult = await aiExecutionFacade.execute<{ ideas: ContentIdea[] }>({
        featureId: "content_studio_ideas",
        userId: options.userId,
        prompt: {
          name: CONTENT_STUDIO_IDEAS_PROMPT_NAME,
          version: CONTENT_STUDIO_IDEAS_PROMPT_ACTIVE_VERSION,
          variables: {
            topic,
            contentGoal,
            numberOfIdeas: String(numberOfIdeas),
            existingArticles: existingTitlesText,
            existingCategoriesHint: categoriesHint,
          },
        },
      });

      if (facadeResult.data && Array.isArray(facadeResult.data.ideas)) {
        rawIdeas = facadeResult.data.ideas;
      }
    } catch (err: any) {
      console.warn(
        `[IdeaGeneratorService] Facade execution failed (${err.message}), falling back to direct provider call:`
      );
      try {
        rawIdeas = await this.fallbackDirectGeneration(
          topic,
          contentGoal,
          numberOfIdeas,
          categoriesHint,
          existingTitlesText
        );
      } catch (directErr: any) {
        console.warn(
          `[IdeaGeneratorService] Direct provider call failed (${directErr.message}), using strategic fallback ideas:`
        );
        rawIdeas = this.generateStrategicFallbackIdeas(topic, contentGoal, numberOfIdeas);
      }
    }

    if (!rawIdeas || rawIdeas.length === 0) {
      rawIdeas = this.generateStrategicFallbackIdeas(topic, contentGoal, numberOfIdeas);
    }

    // 3. Post-process ideas: strategic role, next-logical recommendation, internal linking & duplicate checks
    const isHardwareTopic = /gpu|pc hardware|hardware|graphics card|vram|cpu|ram/i.test(topic);
    const nextRecTitle = (intelligence.nextLogicalRecommendation?.articleTitle || "").toLowerCase();
    let hasAssignedNextLogical = false;

    const processedIdeas: ContentIdea[] = rawIdeas.map((idea, idx) => {
      const duplicateRisk = contentInventoryService.checkDuplicateRisk(
        idea.title,
        matchedArticles
      );

      const hasRelated = Boolean(
        idea.relatedArticleTitle || (matchedArticles[0] && matchedArticles[0].title)
      );
      const relatedArticle =
        matchedArticles.find((a) => a.title === idea.relatedArticleTitle) ||
        (hasRelated ? matchedArticles[0] : undefined);

      // Determine Pillar vs Supporting role
      const isPillar =
        idea.contentRole === "pillar" ||
        (idx === 0 && (idea.contentType === "guide" || idea.title.toLowerCase().includes("guide"))) ||
        idea.title.toLowerCase().includes("ultimate") ||
        idea.title.toLowerCase().includes("complete guide");
      const contentRole = isPillar ? "pillar" : "supporting";

      // Match Next Logical Article recommendation in cluster strategy
      const titleLower = idea.title.toLowerCase();
      let isNextLogical = false;
      if (!hasAssignedNextLogical) {
        if (
          idea.isNextLogicalArticle === true ||
          (Boolean(nextRecTitle) && (
            titleLower.includes(nextRecTitle) ||
            (nextRecTitle.includes("dlss") && titleLower.includes("dlss")) ||
            (nextRecTitle.includes("bottleneck") && titleLower.includes("bottleneck"))
          ))
        ) {
          isNextLogical = true;
          hasAssignedNextLogical = true;
        }
      }

      const nextLogicalReason = isNextLogical
        ? idea.nextLogicalReason ||
          intelligence.nextLogicalRecommendation?.rationale ||
          "Recommended next logical step to fill the highest-impact cluster authority gap."
        : undefined;

      // Internal Linking Suggestions
      let internalLinkingSuggestions = idea.internalLinkingSuggestions || [];
      if (!internalLinkingSuggestions || internalLinkingSuggestions.length === 0) {
        if (matchedArticles.length > 0) {
          internalLinkingSuggestions = matchedArticles.slice(0, 2).map((art, aIdx) => ({
            direction: (aIdx === 0 ? "inbound" : "outbound") as "inbound" | "outbound",
            articleTitle: art.title,
            articleSlug: art.slug,
            recommendedAnchorText: art.title.split(/[:(?]/)[0].trim().slice(0, 32),
            strategicReason:
              contentRole === "pillar"
                ? `Pillar article consolidates topical link equity from "${art.title}"`
                : `Supporting article links up to authoritative cornerstone "${art.title}"`,
          }));
        } else if (isHardwareTopic) {
          internalLinkingSuggestions = [
            {
              direction: "inbound",
              articleTitle: "What is VRAM? (Video RAM Explained)",
              articleSlug: "what-is-vram",
              recommendedAnchorText: "video memory buffer",
              strategicReason: "Pillar article aggregates link equity from foundational VRAM explainer",
            },
            {
              direction: "outbound",
              articleTitle: "Used GPU Buying Guide: What to Check Before Buying",
              articleSlug: "used-gpu-buying-guide",
              recommendedAnchorText: "second-hand graphics card checklist",
              strategicReason: "Contextual buyer funnel linking architecture insights to purchasing criteria",
            },
          ];
        } else {
          internalLinkingSuggestions = [
            {
              direction: "outbound",
              articleTitle: `${topic} Architectural Foundations`,
              articleSlug: `${topic.toLowerCase().replace(/\s+/g, "-")}-foundations`,
              recommendedAnchorText: `${topic} core fundamentals`,
              strategicReason: `Establishes semantic cluster connectivity back to the central ${topic} pillar`,
            },
          ];
        }
      }

      return {
        ...idea,
        id: idea.id || `idea-${idx + 1}-${Date.now()}`,
        contentRole,
        isNextLogicalArticle: isNextLogical,
        nextLogicalReason,
        duplicateRisk,
        contentRelationship:
          idea.contentRelationship ||
          (duplicateRisk.isDuplicateRisk
            ? "supports_existing"
            : matchedArticles.length === 0 && !isHardwareTopic
            ? "new_topic"
            : "content_gap"),
        relatedArticleTitle:
          idea.relatedArticleTitle ||
          relatedArticle?.title ||
          (isHardwareTopic ? "What is VRAM? (Video RAM Explained)" : undefined),
        relatedArticleSlug:
          idea.relatedArticleSlug ||
          relatedArticle?.slug ||
          (isHardwareTopic ? "what-is-vram" : undefined),
        internalLinkingSuggestions,
      };
    });

    // Ensure at least one idea is marked as the next logical article if none matched above
    if (!hasAssignedNextLogical && processedIdeas.length > 0) {
      const topGapIdx = processedIdeas.findIndex((i) => i.contentRelationship === "content_gap");
      const targetIdx = topGapIdx >= 0 ? topGapIdx : 0;
      processedIdeas[targetIdx].isNextLogicalArticle = true;
      processedIdeas[targetIdx].nextLogicalReason =
        intelligence.nextLogicalRecommendation?.rationale ||
        "Strategically prioritized to expand OpenIdear's topical coverage.";
    }

    return {
      ideas: processedIdeas,
      intelligence,
    };
  }

  private async fallbackDirectGeneration(
    topic: string,
    goal: string,
    count: number,
    categoriesHint: string,
    existingArticles: string
    let provider;
    try {
      provider = providerRegistry.getDefault();
    } catch {
      throw new Error("No AI provider registered in providerRegistry");
    }

    const systemPrompt = `You are an editorial director and SEO strategist for OpenIdear. Generate ${count} structured content ideas for the topic "${topic}" with goal "${goal}".
Return ONLY a valid JSON object matching:
{
  "ideas": [
    {
      "id": "string",
      "title": "string",
      "hook": "string",
      "contentType": "guide" | "comparison" | "tutorial" | "explainer" | "listicle" | "case_study" | "news",
      "category": "string",
      "targetAudience": "string",
      "difficulty": "beginner" | "intermediate" | "advanced",
      "searchIntent": "informational" | "commercial" | "transactional" | "navigational",
      "keywords": ["string"]
    }
  ]
}`;

    const userPrompt = `Topic: ${topic}
Goal: ${goal}
Number of ideas: ${count}
Categories hint: ${categoriesHint}
Existing articles: ${existingArticles}`;

    const response = await provider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 3000,
    });

    const text = response.content || "{}";
    const cleanJson = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    return Array.isArray(parsed.ideas) ? parsed.ideas : [];
  }

  private generateStrategicFallbackIdeas(
    topic: string,
    goal: string,
    count: number
  ): ContentIdea[] {
    const isHardware = /gpu|pc hardware|hardware|graphics card|vram|cpu|ram/i.test(topic);

    if (isHardware) {
      const hardwareTemplates: Array<Omit<ContentIdea, "id">> = [
        {
          title: "What is DLSS & Frame Generation? Complete Guide",
          hook: "Understand AI super-resolution, optical multi-frame generation, and how DLSS transforms modern gaming performance.",
          contentType: "guide",
          category: "Hardware",
          targetAudience: "PC Gamers & Builders",
          difficulty: "intermediate",
          searchIntent: "informational",
          keywords: ["DLSS", "Frame Generation", "Ray Reconstruction", "Upscaling"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
          isNextLogicalArticle: true,
          nextLogicalReason: "OpenIdear already covers VRAM and model comparisons. DLSS bridges the critical technology gap before addressing bottlenecks.",
        },
        {
          title: "GPU Bottleneck: How to Identify & Fix It in Gaming Rigs",
          hook: "Learn how to spot GPU usage dips, calculate balanced CPU pairings, and eliminate frame rate stutter.",
          contentType: "guide",
          category: "Hardware",
          targetAudience: "Intermediate Gamers",
          difficulty: "intermediate",
          searchIntent: "informational",
          keywords: ["GPU Bottleneck", "Hardware Monitoring", "Frame Pacing"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
        },
        {
          title: "RTX 3060 vs 4060 vs 5060: The Ultimate Mid-Range GPU Shootout",
          hook: "Comparing rasterization, ray tracing efficiency, and power consumption across three generations of mainstream cards.",
          contentType: "comparison",
          category: "Hardware",
          targetAudience: "Budget PC Builders",
          difficulty: "intermediate",
          searchIntent: "commercial",
          keywords: ["RTX 3060", "RTX 4060", "RTX 5060", "GPU Benchmark"],
          contentRole: "supporting",
          contentRelationship: "comparison",
        },
        {
          title: "Used GPU Buying Guide: Critical Tests Before Buying",
          hook: "Stress tests, thermal paste inspection, VRAM integrity checks, and spotting ex-mining cards.",
          contentType: "guide",
          category: "Hardware",
          targetAudience: "Budget Gamers",
          difficulty: "beginner",
          searchIntent: "commercial",
          keywords: ["Used GPU", "Second Hand Graphics Card", "FurMark", "Hardware Check"],
          contentRole: "supporting",
          contentRelationship: "supports_existing",
        },
        {
          title: "What is VRAM? Why 8GB is No Longer Enough for Modern Games",
          hook: "A deep dive into texture buffers, resolution scaling, and why video memory limits cause sudden stutter.",
          contentType: "explainer",
          category: "Hardware",
          targetAudience: "Beginner PC Builders",
          difficulty: "beginner",
          searchIntent: "informational",
          keywords: ["VRAM", "Video Memory", "Texture Allocation", "8GB vs 16GB"],
          contentRole: "pillar",
          contentRelationship: "supports_existing",
        },
        {
          title: "How to Undervolt Your GPU: Lower Temps Without Losing FPS",
          hook: "Step-by-step MSI Afterburner guide to reducing power draw, acoustics, and hotspot temperatures.",
          contentType: "tutorial",
          category: "Hardware",
          targetAudience: "Hardware Enthusiasts",
          difficulty: "advanced",
          searchIntent: "informational",
          keywords: ["GPU Undervolt", "MSI Afterburner", "Power Efficiency", "Thermal Optimization"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
        },
        {
          title: "1080p vs 1440p vs 4K GPU Requirements: Resolution Breakdown",
          hook: "Which tier of graphics card do you actually need for your display's native resolution and refresh rate?",
          contentType: "guide",
          category: "Hardware",
          targetAudience: "PC Builders",
          difficulty: "intermediate",
          searchIntent: "informational",
          keywords: ["1440p GPU", "4K Gaming", "Pixel Density", "Monitor Match"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
        },
        {
          title: "PCIe 3.0 vs 4.0 vs 5.0: Does Slot Bandwidth Limit Modern GPUs?",
          hook: "Testing whether older motherboard PCIe lanes cripple mid-range GPUs with x8 lane cuts.",
          contentType: "explainer",
          category: "Hardware",
          targetAudience: "PC Upgraders",
          difficulty: "advanced",
          searchIntent: "informational",
          keywords: ["PCIe 4.0", "PCIe 3.0", "Lane Width", "GPU Bandwidth"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
        },
        {
          title: "How to Safely Clean and Repaste Your Graphics Card",
          hook: "Restore factory thermal performance by replacing dry thermal paste and cracked thermal pads.",
          contentType: "tutorial",
          category: "Hardware",
          targetAudience: "DIY PC Builders",
          difficulty: "intermediate",
          searchIntent: "informational",
          keywords: ["GPU Repaste", "Thermal Pads", "Hotspot Delta", "GPU Maintenance"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
        },
        {
          title: "Is Ray Tracing Worth the Performance Penalty in 2026?",
          hook: "Evaluating path tracing, performance overhead, and visual fidelity in modern game engines.",
          contentType: "explainer",
          category: "Hardware",
          targetAudience: "Gamers & Tech Enthusiasts",
          difficulty: "intermediate",
          searchIntent: "informational",
          keywords: ["Ray Tracing", "Path Tracing", "Lighting Pipeline", "FPS Drop"],
          contentRole: "supporting",
          contentRelationship: "content_gap",
        },
      ];

      return hardwareTemplates.slice(0, count).map((t, idx) => ({
        ...t,
        id: `hardware-idea-${idx + 1}-${Date.now()}`,
      }));
    }

    // Generic dynamic topic fallback
    const genericTemplates: Array<Omit<ContentIdea, "id">> = [
      {
        title: `Comprehensive Guide to ${topic}: Architecture & Best Practices`,
        hook: `A definitive foundational guide covering core concepts, real-world patterns, and mental models for ${topic}.`,
        contentType: "guide",
        category: "Technology",
        targetAudience: "Software Engineers & Tech Leads",
        difficulty: "intermediate",
        searchIntent: "informational",
        keywords: [topic, "Architecture", "Best Practices", "Foundations"],
        contentRole: "pillar",
        contentRelationship: "content_gap",
        isNextLogicalArticle: true,
        nextLogicalReason: `Cornerstone pillar asset to establish primary topical authority for ${topic}.`,
      },
      {
        title: `Common Anti-Patterns and Costly Mistakes in ${topic}`,
        hook: `Identify subtle architectural traps, performance degradation points, and maintenance nightmares before they reach production.`,
        contentType: "explainer",
        category: "Technology",
        targetAudience: "Practitioners",
        difficulty: "intermediate",
        searchIntent: "informational",
        keywords: [topic, "Anti-Patterns", "Troubleshooting", "Pitfalls"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
      {
        title: `${topic} Performance Benchmarks and Optimization Strategies`,
        hook: `Practical data-driven profiling techniques to squeeze maximum throughput and efficiency from ${topic}.`,
        contentType: "guide",
        category: "Technology",
        targetAudience: "Advanced Developers",
        difficulty: "advanced",
        searchIntent: "informational",
        keywords: [topic, "Performance", "Benchmarks", "Optimization"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
      {
        title: `Comparing Top Frameworks & Alternatives for ${topic}`,
        hook: `An objective evaluation matrix analyzing trade-offs, developer experience, and long-term ecosystem health.`,
        contentType: "comparison",
        category: "Technology",
        targetAudience: "Decision Makers & Architects",
        difficulty: "intermediate",
        searchIntent: "commercial",
        keywords: [topic, "Comparison", "Trade-Offs", "Evaluation"],
        contentRole: "supporting",
        contentRelationship: "comparison",
      },
      {
        title: `Step-by-Step Production Deployment Tutorial for ${topic}`,
        hook: `From local development to zero-downtime production deployment with automated monitoring and resilience.`,
        contentType: "tutorial",
        category: "Technology",
        targetAudience: "DevOps & Fullstack Engineers",
        difficulty: "intermediate",
        searchIntent: "informational",
        keywords: [topic, "Production", "Deployment", "Tutorial"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
      {
        title: `The Future of ${topic}: Emerging Trends and Roadmap`,
        hook: `Where is the ecosystem heading over the next 3 years and how to future-proof your tech stack.`,
        contentType: "news",
        category: "Technology",
        targetAudience: "Tech Enthusiasts & Founders",
        difficulty: "beginner",
        searchIntent: "informational",
        keywords: [topic, "Future Trends", "Ecosystem", "Innovation"],
        contentRole: "supporting",
        contentRelationship: "new_topic",
      },
      {
        title: `Real-World Case Study: Scaling ${topic} Under Heavy Load`,
        hook: `How real engineering teams addressed bottlenecks, latency spikes, and data consistency challenges with ${topic}.`,
        contentType: "case_study",
        category: "Technology",
        targetAudience: "System Architects",
        difficulty: "advanced",
        searchIntent: "informational",
        keywords: [topic, "Case Study", "High Scale", "Reliability"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
      {
        title: `Security Checklist & Vulnerability Hardening in ${topic}`,
        hook: `Crucial configuration guardrails, threat model considerations, and access control patterns.`,
        contentType: "guide",
        category: "Technology",
        targetAudience: "Security Engineers",
        difficulty: "advanced",
        searchIntent: "informational",
        keywords: [topic, "Security", "Hardening", "Threat Model"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
      {
        title: `Top 10 Essential Tools & Utilities for ${topic} Developers`,
        hook: `Supercharge your daily workflow with these highly vetted extensions, CLIs, and profiling instruments.`,
        contentType: "listicle",
        category: "Technology",
        targetAudience: "Developers",
        difficulty: "beginner",
        searchIntent: "commercial",
        keywords: [topic, "Tools", "Developer Experience", "Workflow"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
      {
        title: `Migrating to Modern ${topic}: A Pragmatic Transition Blueprint`,
        hook: `How to decouple legacy components and transition smoothly without disrupting user-facing operations.`,
        contentType: "guide",
        category: "Technology",
        targetAudience: "Engineering Managers",
        difficulty: "intermediate",
        searchIntent: "informational",
        keywords: [topic, "Migration", "Refactoring", "Legacy Upgrade"],
        contentRole: "supporting",
        contentRelationship: "content_gap",
      },
    ];

    return genericTemplates.slice(0, count).map((t, idx) => ({
      ...t,
      id: `generic-idea-${idx + 1}-${Date.now()}`,
    }));
  }
}

export const ideaGeneratorService = new IdeaGeneratorService();
