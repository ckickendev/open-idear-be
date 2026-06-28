/**
 * ai/pipeline/types.js
 *
 * Responsibility:
 *   Defines the Pipeline contract and all inter-pipeline types.
 *
 *   PipelineStage   — wraps one agent with input mapping and optional condition:
 *                     { agent, mapInput(prevOutput) → nextInput, condition?(prev) → bool }
 *
 *   Pipeline        — ordered list of PipelineStages with a name and version
 *
 *   PipelineEvent   — wraps AgentChunk with stage metadata:
 *                     { stageIndex, stageName, agentName, chunk: AgentChunk }
 *
 *   PipelineResult  — final accumulated output after all stages complete
 *
 * Why it exists:
 *   The pipeline runner needs to communicate which stage is currently running
 *   to the frontend so it can show stage-level progress ("Planning…",
 *   "Writing…", "Reviewing…"). PipelineEvent is that mechanism.
 */
