/**
 * ai/pipeline/runner.js
 *
 * Responsibility:
 *   run(pipeline, input, ctx) → AsyncGenerator<PipelineEvent>
 *
 *   Sequences a pipeline's stages in order:
 *   - Evaluates each stage's condition() before running it (skip if false)
 *   - Calls stage.mapInput(prevOutput) to transform output between stages
 *   - Calls stage.agent.run(mappedInput, ctx) and wraps each AgentChunk
 *     in a PipelineEvent (adding stageIndex, stageName)
 *   - On any stage failure, emits a PipelineEvent with type "stage_error"
 *     and applies the stage's fallback policy
 *   - Emits a final PipelineEvent with type "pipeline_done" when complete
 *
 * Why it exists:
 *   Agents do not know about other agents. The runner is the only place
 *   that wires them together. If the wiring changes (new stage added,
 *   stages reordered), only pipeline files and this runner change —
 *   agents remain untouched.
 */
