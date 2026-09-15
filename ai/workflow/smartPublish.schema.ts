import { z } from "zod";

/**
 * =============================================================================
 *  SMART PUBLISH SCHEMAS
 *  ai/workflow/smartPublish.schema.ts
 *
 *  Design Decisions:
 *  - Strongly typed Zod schemas for every AI response in the Smart Publish workflow.
 *  - Separated input/output schemas for each composable task.
 *  - Final aggregated result schema for the complete workflow output.
 * =============================================================================
 */

// ─── Input Schema ────────────────────────────────────────────────────────────

export const SmartPublishInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  userId: z.string().min(1, "userId is required"),
});

export type SmartPublishInput = z.infer<typeof SmartPublishInputSchema>;

// ─── Description Task Schema ─────────────────────────────────────────────────

export const DescriptionResultSchema = z.object({
  description: z.string().min(20).max(160),
});

export type DescriptionResult = z.infer<typeof DescriptionResultSchema>;

// ─── Tags Task Schema ────────────────────────────────────────────────────────

export const TagsResultSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).min(3).max(7),
});

export type TagsResult = z.infer<typeof TagsResultSchema>;

// ─── Category Task Schema ────────────────────────────────────────────────────

export const CategoryMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

export type CategoryMatch = z.infer<typeof CategoryMatchSchema>;

export const CategoryDetectionResultSchema = z.object({
  suggestedCategory: CategoryMatchSchema,
});

export type CategoryDetectionResult = z.infer<typeof CategoryDetectionResultSchema>;

// ─── Cover Image Schema ──────────────────────────────────────────────────────

export const CoverImageSuggestionSchema = z.object({
  url: z.string().url(),
  alt: z.string(),
  mediaId: z.string().optional(),
  provider: z.enum(["local", "pexels", "unsplash", "ai-generated"]),
  previewUrl: z.string().optional(),
});

export type CoverImageSuggestion = z.infer<typeof CoverImageSuggestionSchema>;

// ─── SEO Validation Schema ───────────────────────────────────────────────────

export const SEOIssueSchema = z.object({
  field: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
});

export type SEOIssue = z.infer<typeof SEOIssueSchema>;

export const SEOValidationSchema = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(SEOIssueSchema),
  passed: z.boolean(),
});

export type SEOValidation = z.infer<typeof SEOValidationSchema>;

// ─── Aggregated Smart Publish Result ─────────────────────────────────────────

export const SmartPublishResultSchema = z.object({
  description: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  suggestedCategory: CategoryMatchSchema.nullable(),
  slug: z.string().nullable(),
  readTimeMinutes: z.number().nullable(),
  coverImage: CoverImageSuggestionSchema.nullable(),
  seoValidation: SEOValidationSchema.nullable(),
  taskErrors: z.array(z.object({
    taskName: z.string(),
    error: z.string(),
  })).default([]),
});

export type SmartPublishResult = z.infer<typeof SmartPublishResultSchema>;
