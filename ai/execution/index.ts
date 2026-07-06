// =============================================================================
//  AI EXECUTION PLATFORM — PUBLIC BARREL
//  ai/execution/index.ts
// =============================================================================

export {
  type ExecutionPolicy,
  type ExecutionContext,
  type ExecutionResult,
  type ExecutionMiddleware,
  type ExecutionStage,
} from "./types";

export {
  type UserContext,
  type PromptContext,
  type ArticleContext,
  type SelectionContext,
  type EditorContextState,
  type PublishingContextState,
  type TelemetryMetadata,
  ExecutionContextContainer,
} from "./context";

export {
  MetricsMiddleware,
  TelemetryLoggingMiddleware,
  CacheMiddleware,
  BudgetMiddleware,
  SafetyMiddleware,
  JsonSelfHealingMiddleware,
  RetryMiddleware,
} from "./middleware";

export {
  ExecutionPipeline,
} from "./pipeline";

export {
  PolicyRegistry,
  policyRegistry,
} from "./policy";

export {
  ExecutionFacade,
  aiExecutionFacade,
} from "./facade";
