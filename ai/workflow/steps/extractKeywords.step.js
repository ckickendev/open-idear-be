/**
 * ai/workflow/steps/extractKeywords.step.js
 *
 * Responsibility:
 *   Analyzes article content and extracts a ranked list of keywords.
 *   Returns primary keyword, LSI (latent semantic indexing) keywords,
 *   and keyword density insights.
 *
 *   Input:  { content, targetKeyword? }
 *   Output: { primaryKeyword, lsiKeywords: string[], densityWarnings: string[] }
 *
 * Why it exists:
 *   Both SEOAgent and PlannerAgent need keyword extraction. Defining the
 *   step once avoids duplicated prompt logic and ensures consistent output
 *   shape regardless of which agent triggers it.
 */
