// =============================================================================
//  PROVIDER LAYER — PUBLIC BARREL
//  ai/provider/index.ts
//
//  This is the only import path the rest of the application uses.
//  Internal file layout of this folder is free to change without breaking
//  anything outside ai/provider/.
//
//  What is exported and why:
//
//  Types (AIProvider, AIMessage, etc.)
//    — Consumed by workflow steps (via WorkflowContext), agents, and pipelines.
//
//  AIError + AIErrorCode
//    — Consumers need to catch and inspect these; they must be exported.
//
//  GeminiProvider (the class, not an instance)
//    — Exported so the application startup file can call `new GeminiProvider(key)`.
//      Only server startup should ever instantiate this directly.
//
//  providerRegistry (the singleton)
//    — The single registration point. Server startup calls register() here.
//      WorkflowContext holds a resolved AIProvider reference — steps never
//      import from this barrel directly.
// =============================================================================

// ─── Public contract (interface + types + errors) ────────────────────────────
export type {
  AIProvider,
  AIMessage,
  MessageRole,
  CompletionOptions,
  TokenUsage,
  AICompletion,
  AIJSONResult,
  AIErrorCode,
} from "./types";

export { AIError } from "./types";

// ─── Gemini implementation ────────────────────────────────────────────────────
export { GeminiProvider } from "./gemini.provider";

// ─── Registry singleton ───────────────────────────────────────────────────────
export { ProviderRegistry, providerRegistry } from "./registry";
