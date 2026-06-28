// =============================================================================
//  AI FEATURE MODULE — PUBLIC ENTRY POINT
//  ai/index.ts
//
//  Single point of access for all AI capabilities in the OpenIdear application.
//  Exports:
//  - Providers: providerRegistry, GeminiProvider, and AIProvider interfaces.
//  - Prompts: PromptBuilder, PromptLoader, PromptRegistry, and version routing.
//  - Context: AIContext and AIContextCollector.
// =============================================================================

// ─── Provider Layer ──────────────────────────────────────────────────────────
export {
  type AIProvider,
  type AIMessage,
  type CompletionOptions,
  type TokenUsage,
  type AICompletion,
  type AIJSONResult,
  type AIErrorCode,
  AIError,
  GeminiProvider,
  ProviderRegistry,
  providerRegistry,
} from "./provider";

// ─── Prompt Layer ─────────────────────────────────────────────────────────────
export {
  PromptBuilder,
  type BuiltPrompt,
  PromptLoader,
  FilePromptSource,
  promptLoader,
  type PromptDefinition,
  type PromptSource,
  PromptRegistry,
  promptRegistry,
} from "./prompt";

// ─── Context Layer ────────────────────────────────────────────────────────────
export {
  type AIContext,
  AIContextCollector,
} from "./context";

// ─── Telemetry Layer (Logger) ──────────────────────────────────────────────────
export {
  type AILogEntry,
  type AILogger,
  type LoggedPrompt,
  type LoggedError,
  ConsoleAILogger,
  FileAILogger,
  TelemetryLoggerManager,
  aiLogger,
  calculateCost,
} from "./telemetry";

// ─── Agent Layer ──────────────────────────────────────────────────────────────
export {
  BaseAgent,
  type AgentOptions,
  type AgentResult,
} from "./agent";

// ─── Workflow Layer ───────────────────────────────────────────────────────────
export {
  Workflow,
  type WorkflowStage,
} from "./workflow";
