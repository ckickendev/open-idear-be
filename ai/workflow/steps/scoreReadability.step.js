/**
 * ai/workflow/steps/scoreReadability.step.js
 *
 * Responsibility:
 *   Scores content for reading ease using the model to assess sentence
 *   complexity, passive voice usage, paragraph length, and jargon density.
 *   Returns a numeric score and a list of specific improvement suggestions.
 *
 *   Input:  { content }
 *   Output: { score: number (0–100), level: string, suggestions: string[] }
 *
 * Why it exists:
 *   Readability scoring is used by both ReviewerAgent (quality check) and
 *   ImproveAgent (post-improvement validation). Centralizing it here
 *   means a single prompt improvement benefits both agents.
 */
