const { z } = require("zod");

const ImagePriorityEnum = z.enum(["high", "medium", "low"]);

const ImagePlacementTypeEnum = z.enum([
  "cover",
  "section-header",
  "contextual-body",
  "diagram-fallback",
  "infographic",
]);

const ImageProviderSourceEnum = z.enum([
  "local",
  "unsplash",
  "pexels",
  "ai-generated",
]);

const ImageSuggestionSchema = z.object({
  heading: z.string().trim().min(1, "Heading context cannot be empty"),
  position: z.number().int().nonnegative(),
  type: ImagePlacementTypeEnum,
  query: z.string().trim().min(2, "Search query must contain at least 2 characters"),
  alt: z.string().trim().min(2, "Alt text must contain at least 2 characters"),
  priority: ImagePriorityEnum,
});

const ImagePlanSchema = z.object({
  articleTopic: z.string().trim().min(1, "Article topic is required"),
  totalSuggestions: z.number().int().nonnegative(),
  suggestions: z.array(ImageSuggestionSchema),
});

const ResolvedImageSchema = z.object({
  id: z.string().min(1),
  suggestionId: z.string().optional(),
  position: z.number().int().nonnegative(),
  url: z.string().url(),
  previewUrl: z.string().url().optional(),
  alt: z.string().trim().min(1),
  caption: z.string().trim().optional(),
  provider: ImageProviderSourceEnum,
  mediaId: z.string().optional(),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  markdownSnippet: z.string().min(1),
});

const EnhancementResultSchema = z.object({
  enhancedMarkdown: z.string(),
  enhancedHtml: z.string(),
  insertedImages: z.array(ResolvedImageSchema),
  appliedEnhancements: z.array(z.string()),
  executionTimeMs: z.number().nonnegative(),
});

module.exports = {
  ImagePriorityEnum,
  ImagePlacementTypeEnum,
  ImageProviderSourceEnum,
  ImageSuggestionSchema,
  ImagePlanSchema,
  ResolvedImageSchema,
  EnhancementResultSchema,
};
