/**
 * ai/workflow/steps/summarize.step.js
 *
 * Responsibility:
 *   Produces a condensed summary of a given text at a specified length target.
 *   Used for generating post excerpts, newsletter blurbs, and social previews.
 *
 *   Input:  { content, targetLength: "short" | "medium" | "long", format: "prose" | "bullets" }
 *   Output: { summary: string, wordCount: number }
 *
 * Why it exists:
 *   Summarization is called by PublisherAgent (excerpt), SEOAgent (meta
 *   description candidate), and future social-sharing features. A shared
 *   step guarantees consistent output quality across all callers.
 */
