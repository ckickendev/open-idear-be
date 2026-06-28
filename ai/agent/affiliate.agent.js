/**
 * ai/agent/affiliate.agent.js
 *
 * Responsibility:
 *   AffiliateAgent — scans article content and identifies opportunities
 *   for affiliate link insertion based on mentioned products, services,
 *   or topics that match configured affiliate categories.
 *
 *   Input:  { content, affiliateCategories: string[], existingLinks?: string[] }
 *   Output: { suggestions: AffiliateSuggestion[] }
 *           AffiliateSuggestion: { anchorText, position, category, rationale }
 *
 *   plan() returns:
 *   1. generateText.step with SUGGEST_AFFILIATE_LINKS prompt
 *   2. validateSuggestions step (de-duplicate, filter already-linked)
 *
 * Why it exists:
 *   Affiliate link insertion is a commercially distinct capability — it
 *   must never be mixed into writing or SEO agents to avoid contaminating
 *   their outputs with commercial bias. A dedicated agent keeps the
 *   separation explicit.
 */
