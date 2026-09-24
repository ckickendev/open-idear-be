// =============================================================================
//  AI FEATURE REGISTRY — TYPE DEFINITIONS
//  ai/feature/types.ts
//
//  Design Decisions:
//  - Uses TypeScript literal types (`as const`) to provide compile-time safety.
//  - Every registered AI capability has a canonical ID, category, human-friendly
//    name, detailed description, telemetry key, and estimated credit placeholder.
//  - Strictly NO membership logic, NO billing, and NO credits deduction.
// =============================================================================

export const AI_FEATURE_CATEGORIES = [
  "authoring",
  "editing",
  "growth",
  "publishing",
  "research",
  "media",
] as const;

export type AIFeatureCategory = (typeof AI_FEATURE_CATEGORIES)[number];

export const AI_FEATURE_IDS = [
  // ── Core Requested Features ────────────────────────────────────────────────
  "rewrite",
  "improve_tone",
  "summarize",
  "faq_generation",
  "comparison_generation",
  "seo_outline",
  "research_topic",
  "publish_by_ai",

  // ── Authoring & Core Workflows ─────────────────────────────────────────────
  "article_writer",
  "article_writer_stream",
  "content_structure",

  // ── Editor / Copilot Actions ───────────────────────────────────────────────
  "continue",
  "improve",
  "example",
  "review",
  "shorten",
  "expand",

  // ── Growth Tasks ───────────────────────────────────────────────────────────
  "internal_links",
  "social_post",
  "affiliate",
  "content_gap",

  // ── Publishing Tasks ───────────────────────────────────────────────────────
  "publish_metadata",
  "publish_review",
  "publish_seo",
  "publish_category",
  "publisher_cover_image",

  // ── Media & Visuals ────────────────────────────────────────────────────────
  "image_generation",
  "image_editing",
  "diagram_generation",
  "content_enhancement",
  "image_enhancement",
] as const;

export type AIFeatureId = (typeof AI_FEATURE_IDS)[number];

/**
 * Standard contract for an AI feature definition.
 */
export interface AIFeatureDefinition<TId extends AIFeatureId = AIFeatureId> {
  /** Unique literal identifier of this capability */
  readonly id: TId;
  /** Human-readable display name */
  readonly name: string;
  /** Detailed summary of what this capability accomplishes */
  readonly description: string;
  /** Domain category */
  readonly category: AIFeatureCategory;
  /**
   * Estimated credit cost (PLACEHOLDER ONLY).
   * Note: No membership logic, no billing, and no credit deductions are performed.
   */
  readonly estimatedCreditCost: number;
  /** Telemetry metric key for tracking and observability */
  readonly telemetryKey: string;
  /** Optional associated HTTP route endpoint */
  readonly endpoint?: string | undefined;
  /** Default semantic model tier (e.g., "fast" or "quality") */
  readonly defaultModel?: "fast" | "quality" | string | undefined;
  /** Search and filtering tags */
  readonly tags?: readonly string[] | undefined;
}
