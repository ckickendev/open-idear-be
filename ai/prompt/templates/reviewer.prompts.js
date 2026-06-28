/**
 * ai/prompt/templates/reviewer.prompts.js
 *
 * Responsibility:
 *   All prompts owned by the ReviewerAgent.
 *
 *   Exports:
 *   REVIEW_DRAFT     — given full article draft, return structured feedback:
 *                      { score, strengths[], weaknesses[], suggestions[] }
 *   SUGGEST_EDITS    — given a specific paragraph, return inline edit suggestions
 *   CHECK_FACTS      — given a claim or sentence, flag potential factual issues
 *
 * Why it exists:
 *   Reviewer prompts always produce structured quality assessments.
 *   Versioning these independently allows improving the review rubric
 *   without touching the writing pipeline.
 */
