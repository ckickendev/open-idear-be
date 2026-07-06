import { z } from "zod";

/**
 * =============================================================================
 *  PUBLISHING TASK SCHEMAS
 *  ai/workflow/publishTask.schema.ts
 *
 *  Design Decisions:
 *  - Strongly typed Zod schemas mapping exactly to prompt output constraints.
 *  - Used to enforce format validation and safe property coercion on task results.
 * =============================================================================
 */

// ─── Metadata Task Result Schema ─────────────────────────────────────────────
export const MetadataResultSchema = z.object({
  /** Indicates whether the draft post has a valid, non-blank title string. */
  titlePresent: z.boolean(),
  /** The total character count of the draft body content. */
  contentLength: z.number(),
  /** True if the draft content length meets or exceeds the minimum threshold of 50 characters. */
  isMinLengthValid: z.boolean(),
});

export type MetadataResult = z.infer<typeof MetadataResultSchema>;

// ─── Readability Review Task Result Schema ────────────────────────────────────
export const ReviewResultSchema = z.object({
  /** A quality audit score from 0 to 100 representing the readability and formatting. */
  score: z.number().min(0).max(100),
  /** A list of actionable text recommendations to improve readability. */
  suggestions: z.array(z.string()),
  /** A list of format warnings (e.g., missing code fences, bad header nesting). */
  warnings: z.array(z.string()),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ─── SEO Task Result Schema ──────────────────────────────────────────────────
export const SEOResultSchema = z.object({
  /** A search-friendly URL slug (lowercase, alphanumeric characters separated by hyphens). */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** A summary description optimized for search results snippet displays (max 160 chars). */
  metaDescription: z.string().max(160),
  /** An array of key search terms relevant to the post body copy. */
  keywords: z.array(z.string()),
});

export type SEOResult = z.infer<typeof SEOResultSchema>;

// ─── Category Task Result Schema ─────────────────────────────────────────────
export const CategoryResultSchema = z.object({
  /** The primary category label predicted for the text. */
  suggestedCategory: z.string(),
  /** The model confidence score (0.0 to 1.0) of the classification. */
  confidence: z.number().min(0.0).max(1.0),
});

export type CategoryResult = z.infer<typeof CategoryResultSchema>;
