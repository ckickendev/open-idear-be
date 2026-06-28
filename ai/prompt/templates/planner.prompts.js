/**
 * ai/prompt/templates/planner.prompts.js
 *
 * Responsibility:
 *   All prompts owned by the PlannerAgent.
 *
 *   Exports:
 *   GENERATE_OUTLINE   — given topic + target audience + format, produce a
 *                        structured JSON outline (title, sections, keywords)
 *   EXPAND_OUTLINE     — given a sparse outline node, add sub-points
 *   SUGGEST_ANGLES     — given a broad topic, return 3–5 distinct article angles
 *
 * Why it exists:
 *   Planning prompts are structurally different from writing prompts — they
 *   always request JSON output and focus on structure over prose. Keeping them
 *   separate makes them easier to version independently.
 */
