/**
 * ai/workflow/steps/improveText.step.js
 *
 * Responsibility:
 *   Takes a selected block of text and an improvement instruction, then
 *   returns a rewritten version that preserves the author's intent while
 *   applying the requested change (clarity, tone, conciseness, etc.).
 *
 *   Input:  { originalText, instruction, context? }
 *           context: surrounding paragraphs for coherence
 *   Output: { improvedText: string, changesSummary: string }
 *
 * Why it exists:
 *   Both ImproveAgent and ReviewerAgent use this step. Defining it once
 *   prevents drift between the two callers' improvement logic.
 */
