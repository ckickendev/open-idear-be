// =============================================================================
//  AI FEATURE REGISTRY — CORE IMPLEMENTATION
//  ai/feature/ai-feature.registry.ts
//
//  Design Decisions:
//  - Centralized single-source-of-truth registry for all AI features.
//  - Strictly enforces TypeScript literal types for feature IDs and categories.
//  - Zero membership logic, zero billing, zero credit deductions.
//  - Features contain placeholder credit costs and explicit telemetry keys.
//  - Transparent alias resolution ensures 100% backward compatibility for existing endpoints.
// =============================================================================

import {
  type AIFeatureId,
  type AIFeatureCategory,
  type AIFeatureDefinition,
  AI_FEATURE_IDS,
  AI_FEATURE_CATEGORIES,
} from "./types";

export class AIFeatureRegistry {
  private readonly features = new Map<AIFeatureId, AIFeatureDefinition>();
  private readonly aliasMap = new Map<string, AIFeatureId>();

  constructor() {
    this.registerDefaults();
    this.registerDefaultAliases();
  }

  /**
   * Registers or updates an AI feature definition.
   */
  register(definition: AIFeatureDefinition): this {
    if (!definition || !definition.id) {
      throw new Error("Cannot register an AI feature without a valid id.");
    }
    this.features.set(definition.id, Object.freeze({ ...definition }));
    return this;
  }

  /**
   * Retrieves a registered feature by its canonical ID.
   * Throws an error if the feature is not found.
   */
  get(id: AIFeatureId | string): AIFeatureDefinition {
    const feature = this.features.get(id as AIFeatureId);
    if (!feature) {
      throw new Error(`AI Feature with ID "${id}" is not registered in aiFeatureRegistry.`);
    }
    return feature;
  }

  /**
   * Finds a registered feature by its canonical ID or returns undefined.
   */
  find(id: string): AIFeatureDefinition | undefined {
    return this.features.get(id as AIFeatureId);
  }

  /**
   * Checks whether a feature is registered with the given canonical ID.
   */
  has(id: string): boolean {
    return this.features.has(id as AIFeatureId);
  }

  /**
   * Returns an array of all registered features.
   */
  getAll(): readonly AIFeatureDefinition[] {
    return Array.from(this.features.values());
  }

  /**
   * Returns all registered features under a specific category.
   */
  getByCategory(category: AIFeatureCategory): readonly AIFeatureDefinition[] {
    return Array.from(this.features.values()).filter((f) => f.category === category);
  }

  /**
   * Resolves a feature definition from either its canonical ID or a recognized alias.
   * Throws a descriptive error if neither matches.
   */
  resolve(aliasOrId: string): AIFeatureDefinition {
    const trimmed = (aliasOrId || "").trim();
    if (!trimmed) {
      throw new Error("Cannot resolve empty or undefined feature identifier.");
    }

    // 1. Direct match with registered canonical ID
    if (this.features.has(trimmed as AIFeatureId)) {
      return this.features.get(trimmed as AIFeatureId)!;
    }

    // 2. Lookup in alias map (e.g., "faq" -> "faq_generation")
    const canonicalId = this.aliasMap.get(trimmed.toLowerCase());
    if (canonicalId && this.features.has(canonicalId)) {
      return this.features.get(canonicalId)!;
    }

    throw new Error(
      `Unknown AI feature or alias: "${aliasOrId}". Registered features: ${Array.from(this.features.keys()).join(", ")}`
    );
  }

  /**
   * Registers a backward-compatibility or convenience alias pointing to a canonical feature ID.
   */
  registerAlias(alias: string, canonicalId: AIFeatureId): this {
    if (!this.features.has(canonicalId)) {
      throw new Error(
        `Cannot register alias "${alias}" for non-existent canonical feature "${canonicalId}".`
      );
    }
    this.aliasMap.set(alias.toLowerCase().trim(), canonicalId);
    return this;
  }

  /**
   * Returns the list of all registered alias mappings.
   */
  getAliases(): ReadonlyMap<string, AIFeatureId> {
    return this.aliasMap;
  }

  // ─── Default Feature Registrations ─────────────────────────────────────────

  private registerDefaults(): void {
    const defaultFeatures: readonly AIFeatureDefinition[] = [
      // ── Core Requested Features ───────────────────────────────────────────
      {
        id: "rewrite",
        name: "Rewrite Content",
        description: "Rewrite selected text for enhanced clarity, conciseness, and narrative flow.",
        category: "editing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.editing.rewrite",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["editor", "inline", "polish"],
      },
      {
        id: "improve_tone",
        name: "Improve Tone",
        description: "Adjust writing tone (professional, casual, persuasive, authoritative) for target audience.",
        category: "editing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.editing.improve_tone",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["editor", "tone", "style"],
      },
      {
        id: "summarize",
        name: "Summarize Content",
        description: "Generate concise executive or tl;dr summaries of text blocks or articles.",
        category: "editing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.editing.summarize",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["editor", "summary", "tldr"],
      },
      {
        id: "faq_generation",
        name: "FAQ Generation",
        description: "Extract and formulate high-value Q&A pairs for reader engagement and SEO rich snippets.",
        category: "growth",
        estimatedCreditCost: 10,
        telemetryKey: "ai.growth.faq",
        endpoint: "/api/growth/task",
        defaultModel: "fast",
        tags: ["growth", "seo", "faq"],
      },
      {
        id: "comparison_generation",
        name: "Comparison Generation",
        description: "Generate comprehensive markdown comparison tables comparing options, products, or approaches.",
        category: "growth",
        estimatedCreditCost: 15,
        telemetryKey: "ai.growth.comparison",
        endpoint: "/api/growth/task",
        defaultModel: "quality",
        tags: ["growth", "table", "comparison"],
      },
      {
        id: "seo_outline",
        name: "SEO Outline Planner",
        description: "Analyze topic, target audience, and search intent to formulate a structured article outline.",
        category: "authoring",
        estimatedCreditCost: 10,
        telemetryKey: "ai.authoring.outline",
        endpoint: "/ai/v1/planner",
        defaultModel: "quality",
        tags: ["planning", "outline", "seo"],
      },
      {
        id: "research_topic",
        name: "Deep Topic Research",
        description: "Perform comprehensive background topic research and generate core insights and key angles.",
        category: "research",
        estimatedCreditCost: 20,
        telemetryKey: "ai.research.topic",
        defaultModel: "quality",
        tags: ["research", "insights", "knowledge"],
      },
      {
        id: "publish_by_ai",
        name: "Multi-Agent Publisher",
        description: "Autonomous multi-agent pipeline generating research, outline, sections, cover image, and SEO metadata.",
        category: "publishing",
        estimatedCreditCost: 40,
        telemetryKey: "ai.publishing.publish_by_ai",
        endpoint: "/ai/v1/publisher/generate",
        defaultModel: "quality",
        tags: ["publisher", "autonomous", "pipeline"],
      },

      // ── Authoring & Core Workflows ─────────────────────────────────────────
      {
        id: "article_writer",
        name: "Article Section Writer",
        description: "Draft comprehensive article sections based on structured outline and brand voice instructions.",
        category: "authoring",
        estimatedCreditCost: 25,
        telemetryKey: "ai.authoring.writer",
        endpoint: "/ai/v1/writer",
        defaultModel: "quality",
        tags: ["authoring", "drafting", "sections"],
      },
      {
        id: "article_writer_stream",
        name: "Streaming Article Writer",
        description: "Stream generated article content in real-time chunk-by-chunk for responsive user experience.",
        category: "authoring",
        estimatedCreditCost: 25,
        telemetryKey: "ai.authoring.writer_stream",
        endpoint: "/ai/v1/writer/stream",
        defaultModel: "quality",
        tags: ["authoring", "streaming"],
      },
      {
        id: "content_structure",
        name: "Content Structure Pass",
        description: "Analyze and parse markdown text into rich structured content blocks.",
        category: "publishing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.publishing.structure",
        endpoint: "/ai/v1/structure",
        defaultModel: "fast",
        tags: ["blocks", "structure", "markdown"],
      },

      // ── Editor / Copilot Actions ───────────────────────────────────────────
      {
        id: "continue",
        name: "Continue Writing",
        description: "Seamlessly predict and compose the next sentences based on preceding paragraph context.",
        category: "editing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.editing.continue",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["copilot", "autocomplete", "continuation"],
      },
      {
        id: "improve",
        name: "Polish & Improve",
        description: "Fix grammar, enhance vocabulary, and polish phrasing of highlighted text.",
        category: "editing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.editing.improve",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["copilot", "grammar", "enhancement"],
      },
      {
        id: "example",
        name: "Generate Example",
        description: "Build an illustrative text or code block based on highlighted technical concepts.",
        category: "editing",
        estimatedCreditCost: 8,
        telemetryKey: "ai.editing.example",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["copilot", "code", "illustration"],
      },
      {
        id: "review",
        name: "Editorial Peer Review",
        description: "Generate a complete peer review audit checklist and suggestions report for article drafts.",
        category: "editing",
        estimatedCreditCost: 15,
        telemetryKey: "ai.editing.review",
        endpoint: "/api/editor/action",
        defaultModel: "quality",
        tags: ["copilot", "audit", "checklist"],
      },
      {
        id: "shorten",
        name: "Shorten Block",
        description: "Condense selected paragraph while strictly preserving core meaning and takeaways.",
        category: "editing",
        estimatedCreditCost: 4,
        telemetryKey: "ai.editing.shorten",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["copilot", "concise", "shorten"],
      },
      {
        id: "expand",
        name: "Expand Block",
        description: "Elaborate on concept with additional depth, explanation, and contextual nuance.",
        category: "editing",
        estimatedCreditCost: 6,
        telemetryKey: "ai.editing.expand",
        endpoint: "/api/editor/action",
        defaultModel: "fast",
        tags: ["copilot", "detail", "expand"],
      },

      // ── Growth Tasks ───────────────────────────────────────────────────────
      {
        id: "internal_links",
        name: "Internal Link Discovery",
        description: "Discover and insert contextual anchor cross-links across the published article catalog.",
        category: "growth",
        estimatedCreditCost: 8,
        telemetryKey: "ai.growth.internal_links",
        endpoint: "/ai/v1/internal-link",
        defaultModel: "fast",
        tags: ["growth", "seo", "backlinks"],
      },
      {
        id: "social_post",
        name: "Social Post Repurposing",
        description: "Generate viral social media posts (Twitter/X, LinkedIn) distilled from article insights.",
        category: "growth",
        estimatedCreditCost: 8,
        telemetryKey: "ai.growth.social_post",
        endpoint: "/api/growth/task",
        defaultModel: "fast",
        tags: ["growth", "social", "distribution"],
      },
      {
        id: "affiliate",
        name: "Affiliate Opportunity",
        description: "Identify organic product recommendation touchpoints and contextual monetization opportunities.",
        category: "growth",
        estimatedCreditCost: 10,
        telemetryKey: "ai.growth.affiliate",
        endpoint: "/api/growth/task",
        defaultModel: "fast",
        tags: ["growth", "monetization", "affiliate"],
      },
      {
        id: "content_gap",
        name: "Content Gap Analysis",
        description: "Detect missing subtopics, unanswered reader queries, and competitive coverage gaps.",
        category: "growth",
        estimatedCreditCost: 12,
        telemetryKey: "ai.growth.content_gap",
        endpoint: "/api/growth/task",
        defaultModel: "quality",
        tags: ["growth", "gap", "competitive"],
      },

      // ── Publishing Tasks ───────────────────────────────────────────────────
      {
        id: "publish_metadata",
        name: "Metadata Extraction",
        description: "Generate optimized title, SEO slug, concise excerpt, and meta descriptions.",
        category: "publishing",
        estimatedCreditCost: 5,
        telemetryKey: "ai.publishing.metadata",
        endpoint: "/api/publishing/task",
        defaultModel: "fast",
        tags: ["publishing", "metadata", "slug"],
      },
      {
        id: "publish_review",
        name: "Preflight Quality Review",
        description: "Audit draft completeness, formatting adherence, tone consistency, and readiness score.",
        category: "publishing",
        estimatedCreditCost: 8,
        telemetryKey: "ai.publishing.review",
        endpoint: "/api/publishing/task",
        defaultModel: "quality",
        tags: ["publishing", "audit", "preflight"],
      },
      {
        id: "publish_seo",
        name: "Preflight SEO Audit",
        description: "Analyze keyword density, heading hierarchy, link anchors, and readability index.",
        category: "publishing",
        estimatedCreditCost: 8,
        telemetryKey: "ai.publishing.seo",
        endpoint: "/api/publishing/task",
        defaultModel: "fast",
        tags: ["publishing", "seo", "audit"],
      },
      {
        id: "publish_category",
        name: "Category Matcher",
        description: "Classify draft into the most accurate taxonomy category based on content semantics.",
        category: "publishing",
        estimatedCreditCost: 3,
        telemetryKey: "ai.publishing.category",
        endpoint: "/api/publishing/task",
        defaultModel: "fast",
        tags: ["publishing", "category", "taxonomy"],
      },
      {
        id: "publisher_cover_image",
        name: "Publisher Cover Image",
        description: "Synthesize tailored 16:9 banner prompt and trigger high-fidelity banner asset generation.",
        category: "publishing",
        estimatedCreditCost: 20,
        telemetryKey: "ai.publishing.cover_image",
        endpoint: "/ai/v1/publisher/cover-image",
        defaultModel: "fast",
        tags: ["publishing", "cover", "image"],
      },

      // ── Media & Visuals ────────────────────────────────────────────────────
      {
        id: "image_generation",
        name: "AI Image Generation",
        description: "Generate original high-resolution visual illustrations and banners from descriptive prompts.",
        category: "media",
        estimatedCreditCost: 20,
        telemetryKey: "ai.media.image_generation",
        endpoint: "/ai/v1/image/generate",
        defaultModel: "fast",
        tags: ["media", "image", "generative"],
      },
      {
        id: "image_editing",
        name: "AI Image Editing",
        description: "Perform generative inpainting, smart resizing, style transfer, and background adjustments.",
        category: "media",
        estimatedCreditCost: 20,
        telemetryKey: "ai.media.image_editing",
        endpoint: "/ai/v1/image/edit",
        defaultModel: "fast",
        tags: ["media", "inpainting", "edit"],
      },
      {
        id: "diagram_generation",
        name: "Mermaid Diagram Studio",
        description: "Synthesize syntactically valid Mermaid architecture, sequence, and entity relationship diagrams.",
        category: "media",
        estimatedCreditCost: 10,
        telemetryKey: "ai.media.diagram",
        endpoint: "/ai/v1/diagram/generate",
        defaultModel: "fast",
        tags: ["media", "diagram", "mermaid"],
      },
      {
        id: "content_enhancement",
        name: "Content Enhancement Pass",
        description: "Refine draft formatting, bullet points, callouts, and clarity across complete article text.",
        category: "media",
        estimatedCreditCost: 15,
        telemetryKey: "ai.media.content_enhance",
        endpoint: "/ai/v1/enhance",
        defaultModel: "quality",
        tags: ["enhancement", "formatting", "polish"],
      },
      {
        id: "image_enhancement",
        name: "Image Enhancement Pass",
        description: "Analyze embedded article media, optimize alt texts, generate missing diagrams, and upscale.",
        category: "media",
        estimatedCreditCost: 15,
        telemetryKey: "ai.media.image_enhance",
        endpoint: "/ai/v1/enhance-images",
        defaultModel: "quality",
        tags: ["enhancement", "media", "upscale"],
      },
    ];

    for (const feature of defaultFeatures) {
      this.register(feature);
    }
  }

  private registerDefaultAliases(): void {
    const defaultAliases: Array<[string, AIFeatureId]> = [
      // Growth aliases
      ["faq", "faq_generation"],
      ["comparison_table", "comparison_generation"],
      ["comparison", "comparison_generation"],

      // Publishing task aliases
      ["metadata", "publish_metadata"],
      ["review_task", "publish_review"],
      ["seo", "publish_seo"],
      ["category", "publish_category"],

      // Authoring aliases
      ["planner", "seo_outline"],
      ["outline", "seo_outline"],
      ["writer", "article_writer"],
      ["stream", "article_writer_stream"],
      ["structure", "content_structure"],

      // Publisher aliases
      ["publisher", "publish_by_ai"],
      ["one_click", "publish_by_ai"],
      ["cover_image", "publisher_cover_image"],

      // Media aliases
      ["diagram", "diagram_generation"],
      ["image", "image_generation"],
    ];

    for (const [alias, canonicalId] of defaultAliases) {
      this.registerAlias(alias, canonicalId);
    }
  }
}

/**
 * Singleton instance of the centralized AI Feature Registry.
 */
export const aiFeatureRegistry = new AIFeatureRegistry();

export {
  type AIFeatureId,
  type AIFeatureCategory,
  type AIFeatureDefinition,
  AI_FEATURE_IDS,
  AI_FEATURE_CATEGORIES,
};
