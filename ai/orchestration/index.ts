// =============================================================================
//  AI ORCHESTRATION PLATFORM — PUBLIC BARREL
//  ai/orchestration/index.ts
// =============================================================================

// ─── Contracts ────────────────────────────────────────────────────────────────
export type {
  RetryPolicy,
  Task,
  OrchestratedTask,
  TaskResult,
  RunStatus,
  StepRecord,
  StepStatus,
  StateCondition,
  StepCondition,
  AndCondition,
  OrCondition,
  NotCondition,
  ConditionExpression,
  StepDefinition,
  WorkflowDefinition,
  OrchestrationRegistryPlugin,
  PipelineRunOptions,
  StepSummary,
  OrchestrationResult,
  Workflow,
  ExecutableWorkflow,
  AlwaysCondition,
  SuccessCondition,
  FailureCondition,
  CustomCondition,
} from "./contracts";

// ─── Execution State ──────────────────────────────────────────────────────────
export {
  ExecutionStateContainer,
  type ReadonlyExecutionState,
} from "./state";

// ─── Condition Evaluator ──────────────────────────────────────────────────────
export {
  ConditionEvaluator,
  customConditionRegistry,
  CustomConditionRegistry,
  type CustomConditionEvaluatorFn,
} from "./condition";

// ─── Registries ───────────────────────────────────────────────────────────────
export {
  TaskRegistry,
  taskRegistry,
  WorkflowRegistry,
  workflowRegistry,
} from "./registry";

// ─── Workflows ────────────────────────────────────────────────────────────────
export { OrchestratedWorkflow } from "./workflow";

// ─── Tasks ────────────────────────────────────────────────────────────────────
export { ExecutionTask, type ExecutionTaskParams } from "./task";

// ─── Pipeline & Results ───────────────────────────────────────────────────────
export {
  OrchestrationPipeline,
  type PipelineEventMap,
  OrchestrationResultBuilder,
} from "./pipeline";

