// =============================================================================
//  AI AGENT Layer — PUBLIC BARREL
//  ai/agent/index.ts
//
//  Standardized entry point for the AI Agent layer.
//  Exports the abstract BaseAgent and typed interfaces for agent runs.
// =============================================================================

export { BaseAgent } from "./base.agent";
export { type AgentOptions, type AgentResult } from "./types";
export { PlannerAgent, type PlannerInput } from "./planner.agent";
export { PlannerSchema, type PlannerOutline } from "./planner.schema";
export { WriterAgent, type WriterInput } from "./writer.agent";
export { WriterSchema, type WriterOutput } from "./writer.schema";
