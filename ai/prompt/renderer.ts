/**
 * ai/prompt/renderer.js
 *
 * Responsibility:
 *   compile(template, input) — fills a PromptTemplate with input values
 *   and returns a ready-to-send { system, user } message pair.
 *
 *   Also handles any preprocessing needed before the prompt is sent:
 *   - Trimming excessive whitespace
 *   - Enforcing maximum character counts per message
 *   - Injecting shared context variables (e.g., platform name, date)
 *
 * Why it exists:
 *   Separates the "what to say" (template) from the "how to format it"
 *   (renderer). Templates stay declarative; rendering logic lives here.
 *   If you need to add content-length guardrails or context injection,
 *   this is the only file that changes.
 */

export {};
