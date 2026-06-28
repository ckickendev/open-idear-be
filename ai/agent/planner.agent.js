/**
 * ai/agent/planner.agent.js
 *
 * Responsibility:
 *   PlannerAgent — converts a topic and user intent into a structured article plan.
 *
 *   Input:  { topic, targetAudience, format, length, keywords? }
 *   Output: ArticleOutline { title, sections[], primaryKeyword, lsiKeywords[] }
 *
 *   plan() returns:
 *   1. generateOutline.step     — produce the raw outline JSON
 *   2. extractKeywords.step     — enrich with keyword strategy
 *   (conditionally) 3. expandOutline step if depth > "shallow"
 *
 * Why it exists:
 *   Planning is a discrete capability with its own input/output contract.
 *   It is the first stage of article.pipeline and can also be called
 *   standalone from the editor's "Plan Article" command.
 */
