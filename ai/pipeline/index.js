/**
 * ai/pipeline/index.js
 *
 * Responsibility:
 *   Barrel export for the pipeline layer.
 *   Exports: PipelineRunner, all pipeline definitions, and pipeline types.
 *
 * Why it exists:
 *   API route controllers import pipelines from here. When a new pipeline
 *   is added, it is registered in this file and is immediately available
 *   to all route handlers.
 */
