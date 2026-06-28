/**
 * ai/workflow/steps/generateOutline.step.js
 *
 * Responsibility:
 *   Calls the GENERATE_OUTLINE prompt, then parses and validates the
 *   model's JSON response into a typed ArticleOutline structure.
 *
 *   Input:  { topic, targetAudience, format, keywords? }
 *   Output: { outline: ArticleOutline }
 *           ArticleOutline: { title, sections: Section[], primaryKeyword, lsiKeywords[] }
 *
 * Why it exists:
 *   Generating an outline always requires structured JSON output — it is
 *   never acceptable to return raw prose here. The step owns the parsing
 *   and validation logic so PlannerAgent.plan() stays clean.
 */
