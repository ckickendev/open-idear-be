/**
 * ai/agent/seo.agent.js
 *
 * Responsibility:
 *   SEOAgent — analyzes content and generates all SEO-relevant metadata.
 *
 *   Input:  { title, content, targetKeyword? }
 *   Output: {
 *     metaDescription: string,
 *     slug: string,
 *     primaryKeyword: string,
 *     lsiKeywords: string[],
 *     seoScore: number,
 *     headingSuggestions: string[]
 *   }
 *
 *   plan() returns:
 *   1. extractKeywords.step      — keyword strategy
 *   2. generateMeta step         — meta description + slug
 *   3. scoreSEO step             — overall SEO score
 *   4. suggestHeadings step      — H2/H3 restructuring advice
 *
 * Why it exists:
 *   SEO metadata generation is both a publish-time step (stage 4 of
 *   article.pipeline) and an on-demand editor action. Encapsulating the
 *   full SEO pass in one agent ensures consistent output in both contexts.
 */
