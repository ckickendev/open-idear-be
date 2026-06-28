/**
 * ai/agent/improve.agent.js
 *
 * Responsibility:
 *   ImproveAgent — rewrites a selected text block based on a user instruction.
 *   This is the engine behind the inline "AI Improve" editor command.
 *
 *   Input:  { selectedText, instruction, surroundingContext? }
 *   Output: { improvedText: string, readabilityDelta: number, changesSummary: string }
 *
 *   plan() returns:
 *   1. improveText.step         — rewrite the selection
 *   2. scoreReadability.step    — score before and after (delta)
 *
 * Why it exists:
 *   The improve flow is the most latency-sensitive AI feature — users are
 *   waiting with text selected. Keeping this as a focused two-step agent
 *   (rather than routing through the full pipeline) keeps it fast.
 */
