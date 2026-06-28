/**
 * ai/prompt/types.js
 *
 * Responsibility:
 *   Defines the PromptTemplate shape and related value objects.
 *
 *   PromptTemplate — the standard shape every prompt must follow:
 *     name          : string         — unique identifier, e.g. "writer.section"
 *     version       : string         — e.g. "v1", enables A/B and rollback
 *     system        : string         — the system instruction sent to the model
 *     user          : (input) => string — builds the user message from typed input
 *     outputSchema  : (optional) — expected structure of the model's response
 *
 *   PromptVersion   — { name, version } pair used to look up a prompt
 *
 * Why it exists:
 *   Enforces a single, consistent shape for all prompts across the system.
 *   Without this contract, prompts become arbitrary strings with no structure,
 *   impossible to version, test, or audit.
 */

export {};
