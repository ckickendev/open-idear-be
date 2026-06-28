/**
 * ai/agent/reviewer.agent.js
 *
 * Responsibility:
 *   ReviewerAgent — evaluates a draft and returns structured quality feedback.
 *
 *   Input:  { draft: string, criteria?: string[] }
 *   Output: {
 *     score: number,
 *     readabilityScore: number,
 *     strengths: string[],
 *     weaknesses: string[],
 *     suggestions: EditSuggestion[]
 *   }
 *
 *   plan() returns:
 *   1. scoreReadability.step    — readability score
 *   2. reviewDraft step (generateText.step with REVIEW_DRAFT prompt)
 *                               — overall quality review
 *
 * Why it exists:
 *   Quality review is both a standalone editor feature ("Review this draft")
 *   and the third stage of article.pipeline. Same agent, two callers.
 */
