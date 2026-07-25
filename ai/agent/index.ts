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
export { DiagramAgent, diagramAgent, type DiagramType, type DiagramRequest, type DiagramResult } from "./diagram.agent";
export { EditorCopilot, editorCopilot, copilotActionRegistry, type CopilotAction } from "./copilot.agent";
export { ImproveAgent, improveAgent } from "./improve.agent";
export { ExampleAgent, exampleAgent } from "./example.agent";
export { ReviewAgent, reviewAgent } from "./review.agent";
export { AffiliateAgent, affiliateAgent, type AffiliateInput, type AffiliateOutput } from "./affiliate.agent";
export { ImageAgent, imageAgent, type ImageAgentInput, type ImageAgentOutput } from "./image.agent";
export { PublisherAgent, publisherAgent, type PublisherAgentInput, type PublisherAgentOutput } from "./publisher.agent";
export { SeoAgent, seoAgent, type SeoAgentInput, type SeoAgentOutput } from "./seo.agent";
export * from "./copilot.schema";
