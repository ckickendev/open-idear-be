/**
 * ai/prompt/validator.js
 *
 * Responsibility:
 *   validateOutput(schema, rawText) — parses a model's raw text response
 *   against the prompt's expected outputSchema.
 *
 *   Handles:
 *   - Stripping markdown code fences (```json ... ```) from model output
 *   - JSON.parse with error recovery
 *   - Schema validation (shape, required fields, types)
 *   - Returns { success, data, errors } — never throws
 *
 * Why it exists:
 *   Models do not reliably return clean JSON. Every step that requests
 *   structured output needs the same parsing and recovery logic. Without
 *   this file, that logic gets duplicated across every step.
 */

export {};
