/**
 * ai/prompt/templates/seo.prompts.js
 *
 * Responsibility:
 *   All prompts owned by the SEOAgent.
 *
 *   Exports:
 *   GENERATE_META      — given title + body, produce meta description (≤160 chars)
 *   EXTRACT_KEYWORDS   — given body, return primary keyword + 5–10 LSI keywords
 *   GENERATE_SLUG      — given title, return a URL-safe slug
 *   SCORE_SEO          — given full article, return an SEO score with rationale
 *   SUGGEST_HEADINGS   — given body, suggest H2/H3 restructuring for SEO
 *
 * Why it exists:
 *   SEO prompts have strict output length constraints and domain-specific
 *   rules (character limits, keyword density). Grouping them here makes
 *   those constraints explicit and easy to enforce in one place.
 */
