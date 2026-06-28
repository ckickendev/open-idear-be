/**
 * ai/agent/publisher.agent.js
 *
 * Responsibility:
 *   PublisherAgent — performs the final pre-publish checklist pass:
 *   validates that all required metadata is present, generates any
 *   missing fields (excerpt, cover image alt text), and returns a
 *   publish-readiness report.
 *
 *   Input:  { postId, draft, seoData, coverImage? }
 *   Output: {
 *     isReady: boolean,
 *     missingFields: string[],
 *     excerpt: string,
 *     coverAltText?: string,
 *     warnings: string[]
 *   }
 *
 *   plan() returns:
 *   1. summarize.step            — generate excerpt if missing
 *   2. analyzeImage.step         — generate cover alt text if missing
 *   3. validatePublishReady step — check all required fields
 *
 * Why it exists:
 *   Publishing has hard requirements (meta description, excerpt, alt text).
 *   Rather than silently failing at publish time, this agent surfaces all
 *   gaps in a single pre-flight check the UI can present to the author.
 */
