import { z } from "zod";

/**
 * =============================================================================
 *  GROWTH TASK SCHEMAS
 *  ai/workflow/growthTask.schema.ts
 *
 *  Design Decisions:
 *  - Strongly typed Zod schemas mapping to growth prompt outputs.
 *  - Enforces structure validations on generated growth value assets.
 * =============================================================================
 */

// ─── FAQ Task Result Schema ──────────────────────────────────────────────────
export const FAQResultSchema = z.object({
  /** Array of frequently asked questions and answers */
  faqs: z.array(
    z.object({
      /** The question extracted from content */
      question: z.string(),
      /** The concise, informational answer */
      answer: z.string(),
    })
  ),
});

export type FAQResult = z.infer<typeof FAQResultSchema>;

// ─── Internal Link Task Result Schema ────────────────────────────────────────
export const InternalLinkResultSchema = z.object({
  /** Array of recommended internal cross-link paths */
  links: z.array(
    z.object({
      /** The target phrase in the post to use as the link text */
      anchorText: z.string(),
      /** The topic/keyword category recommended for linking */
      suggestedTopic: z.string(),
      /** Contextual reason for this link suggestion */
      reason: z.string(),
    })
  ),
});

export type InternalLinkResult = z.infer<typeof InternalLinkResultSchema>;

// ─── Comparison Table Task Result Schema ──────────────────────────────────────
export const ComparisonTableResultSchema = z.object({
  /** Descriptive title for the comparison */
  title: z.string(),
  /** Column header names */
  headers: z.array(z.string()),
  /** Rows values. Each row is an array of column values */
  rows: z.array(z.array(z.string())),
});

export type ComparisonTableResult = z.infer<typeof ComparisonTableResultSchema>;

// ─── Social Post Task Result Schema ──────────────────────────────────────────
export const SocialPostResultSchema = z.object({
  /** Formatted post optimized for LinkedIn sharing */
  linkedin: z.string(),
  /** Sequence of tweets, each representing a single thread post */
  twitterThread: z.array(z.string()),
});

export type SocialPostResult = z.infer<typeof SocialPostResultSchema>;

// ─── Affiliate Task Result Schema ────────────────────────────────────────────
export const AffiliateResultSchema = z.object({
  /** Array of product monetization options */
  suggestions: z.array(
    z.object({
      /** The keyword, library, or tool mentioned in content */
      term: z.string(),
      /** Recommended affiliate product or link target */
      suggestedProduct: z.string(),
      /** Natural placement suggestion context */
      placementTip: z.string(),
    })
  ),
});

export type AffiliateResult = z.infer<typeof AffiliateResultSchema>;

// ─── Content Gap Task Result Schema ──────────────────────────────────────────
export const ContentGapResultSchema = z.object({
  /** Array of structural gaps or topics omitted */
  gaps: z.array(
    z.object({
      /** The missing topic details */
      missingTopic: z.string(),
      /** Advice on how to expand this topic */
      expansionTips: z.string(),
    })
  ),
});

export type ContentGapResult = z.infer<typeof ContentGapResultSchema>;
