import { z } from "zod";

// =============================================================================
//  TRANSLATOR SCHEMA
//  ai/agent/translator.schema.ts
//
//  Zod schema contract for article translation outputs.
//  Enforces non-empty title, description, content markdown, slug, and SEO fields.
// =============================================================================

export const TranslatorSchema = z.object({
  title: z.string().min(1, "Translated title is required"),
  description: z.string().min(1, "Translated description is required"),
  content: z.string().min(1, "Translated content is required"),
  slug: z.string().min(1, "Translated slug is required"),
  seo: z
    .object({
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    })
    .optional(),
});

export type TranslatorOutput = z.infer<typeof TranslatorSchema>;
