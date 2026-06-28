/**
 * ai/pipeline/pipelines/improve.pipeline.js
 *
 * Responsibility:
 *   Defines the text improvement pipeline — a lightweight two-agent flow
 *   for the editor's inline "AI Improve" feature with post-improvement review.
 *
 *   Stages (in order):
 *   1. ImproveAgent   → { improvedText, changesSummary }
 *   2. ReviewerAgent  → { readabilityScore, suggestions }   (condition: only if text > 200 words)
 *
 *   The ReviewerAgent stage is conditional — for short text blocks,
 *   it is skipped to minimize latency.
 *
 * Why it exists:
 *   The improve + review flow is reused in multiple editor commands
 *   ("Improve selection", "Fix grammar", "Simplify"). Defining it as a
 *   named pipeline makes it discoverable and prevents ad-hoc agent
 *   chaining in route handlers.
 */
