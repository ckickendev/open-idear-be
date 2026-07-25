// =============================================================================
//  AI ORCHESTRATION PLATFORM — TYPES & CONTRACTS
//  ai/orchestration/contracts/index.ts
//
//  Design Decisions:
//  - Defines every contract in the Orchestration Platform.
//  - Completely domain-agnostic: no references to posts, users, or business concepts.
//  - OrchestratedTask is the fundamental unit of work.
//  - WorkflowDefinition is a serializable plain-data object (not a class).
//  - Parallel execution is declared explicitly per step via `parallel: true`.
//  - Output is nominated via `outputKey` on WorkflowDefinition.
//  - Durable execution (checkpoint/resume) is deferred to Sprint 5.
// =============================================================================

import type { ZodSchema } from "zod";

// ─── Retry Policy ─────────────────────────────────────────────────────────────

/**
 * Declarative retry configuration for a task or step.
 */
export interface RetryPolicy {
  /** Maximum number of execution attempts (1 = no retry). */
  readonly maxAttempts: number;
  /** Initial delay between retry attempts in milliseconds. */
  readonly initialDelayMs: number;
  /** Multiplier applied to delay after each failed attempt. */
  readonly backoffMultiplier: number;
  /** Maximum time allowed for a single execution attempt in milliseconds. */
  readonly timeoutMs: number;
}

// ─── Task Contracts ──────────────────────────────────────────────────────────

/**
 * Generic, strongly-typed, provider-agnostic contract interface representing an executable Task.
 *
 * It contains no AI code or logic dependencies, and delegates implementation-level
 * Execution Platform calls to the concrete implementation classes.
 */
export interface Task<TInput = any, TOutput = any> {
  /** Unique task identifier. */
  readonly id: string;
  /** Semantic version of this task. */
  readonly version: string;
  /** Description of what this task does. */
  readonly description: string;
  /** Zod schema for runtime input validation. */
  readonly inputSchema: ZodSchema<TInput>;
  /** Zod schema for runtime output validation. */
  readonly outputSchema: ZodSchema<TOutput>;

  /**
   * Execute the task logic.
   *
   * @param input   Typed input parameters.
   * @param context Read-only view of the shared execution context state.
   * @param signal  AbortSignal for cooperative cancellation.
   */
  execute(
    input: TInput,
    context: Readonly<Record<string, any>>,
    signal?: AbortSignal
  ): Promise<TOutput>;
}

/**
 * Orchestrated task subtype that includes scheduler metadata (name, retry policies)
 * used by the Orchestration Pipeline.
 */
export interface OrchestratedTask<TInput = any, TOutput = any> extends Task<TInput, TOutput> {
  /** Human-readable display name. */
  readonly name: string;
  /** Default retry policy. Individual steps may override this. */
  readonly defaultRetryPolicy: RetryPolicy;
}

// ─── Task Result ──────────────────────────────────────────────────────────────

/**
 * Structured result returned by the Pipeline after executing a single task attempt.
 */
export interface TaskResult<TOutput = any> {
  readonly success: boolean;
  readonly output?: TOutput | undefined;
  readonly latencyMs: number;
  readonly attempts: number;
  readonly error?: Error | undefined;
}

// ─── Step Record ─────────────────────────────────────────────────────────────

/** Lifecycle status of a workflow run execution. */
export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** Lifecycle status of a workflow step. */
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/**
 * Immutable record of a step's execution — written to ExecutionState on completion.
 */
export interface StepRecord<TOutput = any> {
  readonly stepId: string;
  readonly taskId: string;
  readonly status: StepStatus;
  readonly input: Record<string, any>;
  readonly output?: TOutput | undefined;
  readonly latencyMs: number;
  readonly attempts: number;
  readonly startedAt: number;
  readonly completedAt?: number | undefined;
  readonly error?: Error | undefined;
}

// ─── Condition Expressions ────────────────────────────────────────────────────

/**
 * Test a value stored in ExecutionState.shared against a scalar comparator.
 */
export interface StateCondition {
  readonly type: "state";
  /** Dot-notation key into ExecutionState.shared (e.g. "seoScore" or "step1.wordCount"). */
  readonly key: string;
  readonly operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "exists" | "notExists" | "includes";
  readonly value?: string | number | boolean | undefined;
}

/**
 * Test whether a prior step reached a specific terminal status.
 */
export interface StepCondition {
  readonly type: "step";
  readonly stepId: string;
  readonly status: Extract<StepStatus, "succeeded" | "failed" | "skipped">;
}

/**
 * Boolean composition of other conditions.
 */
export interface AndCondition {
  readonly type: "and";
  readonly conditions: ConditionExpression[];
}

export interface OrCondition {
  readonly type: "or";
  readonly conditions: ConditionExpression[];
}

export interface NotCondition {
  readonly type: "not";
  readonly condition: ConditionExpression;
}

export interface AlwaysCondition {
  readonly type: "always";
}

export interface SuccessCondition {
  readonly type: "success";
  readonly stepId?: string | undefined;
}

export interface FailureCondition {
  readonly type: "failure";
  readonly stepId?: string | undefined;
}

export interface CustomCondition {
  readonly type: "custom";
  readonly evaluatorId: string;
  readonly args?: Record<string, any> | undefined;
}

/** Discriminated union of all supported condition types. */
export type ConditionExpression =
  | StateCondition
  | StepCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | AlwaysCondition
  | SuccessCondition
  | FailureCondition
  | CustomCondition;

// ─── Step Definition ─────────────────────────────────────────────────────────

/**
 * Declarative configuration for a single step inside a WorkflowDefinition.
 * This is a plain-data object — no class instances, no function references
 * except for inputMapping (which is always locally scoped).
 */
export interface StepDefinition<TInput extends Record<string, any> = Record<string, any>> {
  /** Unique identifier for this step within the workflow. */
  readonly id: string;
  /** ID of the OrchestratedTask to execute. Must be registered in TaskRegistry. */
  readonly taskId: string;
  /**
   * Maps the current ExecutionState.shared into the task's typed input.
   * If omitted, ExecutionState.shared is passed as-is.
   */
  readonly inputMapping?: ((shared: Readonly<Record<string, any>>) => TInput) | undefined;
  /**
   * Key under which this step's output is written into ExecutionState.shared.
   * If omitted, output is still recorded in StepRecord but not added to shared.
   */
  readonly outputKey?: string | undefined;
  /**
   * Condition that must evaluate to true before this step runs.
   * If false, the step is marked 'skipped' and execution continues.
   */
  readonly condition?: ConditionExpression | undefined;
  /**
   * Step IDs that must be in 'succeeded' status before this step starts.
   * Used by the Pipeline to resolve execution order and enable parallelism.
   */
  readonly dependsOn?: string[] | undefined;
  /**
   * When true, this step may execute concurrently with other parallel-flagged
   * steps that share the same resolved dependencies.
   */
  readonly parallel?: boolean | undefined;
  /** Step-level retry override. If omitted, the task's defaultRetryPolicy is used. */
  readonly retryPolicy?: RetryPolicy | undefined;
  /**
   * When true, a step failure does not halt the workflow.
   * The step is recorded as 'failed' and execution continues to the next step.
   * Defaults to false.
   */
  readonly continueOnFailure?: boolean | undefined;
}

// ─── Workflow Definition ──────────────────────────────────────────────────────

/**
 * Serializable, plain-data description of a complete workflow plan.
 *
 * WorkflowDefinition is the core declarative artifact of the Orchestration Platform.
 * It can be stored in a database, loaded from config, or built programmatically.
 * It never contains class instances or closures (except inputMapping).
 */
export interface WorkflowDefinition {
  /** Unique workflow name. Used as the registry key. */
  readonly name: string;
  /** Semantic version string (e.g. "1.0.0"). */
  readonly version: string;
  /** Human-readable description of what this workflow does. */
  readonly description?: string | undefined;
  /** Ordered array of step definitions. Pipeline resolves execution order via dependsOn. */
  readonly steps: StepDefinition[];
  /**
   * The key in ExecutionState.shared that represents the workflow's final output.
   * OrchestrationResult.output will be state.shared[outputKey].
   * If omitted, the last step's output (by declaration order) is used.
   */
  readonly outputKey?: string | undefined;
  /**
   * Workflow-level default retry policy applied to all steps that do not
   * declare their own retryPolicy. If omitted, the task's defaultRetryPolicy is used.
   */
  readonly defaultRetryPolicy?: RetryPolicy | undefined;
}

// ─── Registry Plugin ─────────────────────────────────────────────────────────

/**
 * Lifecycle hooks for observing TaskRegistry and WorkflowRegistry events.
 * Follows the same pattern established in ToolRegistryPlugin.
 */
export interface OrchestrationRegistryPlugin {
  readonly name: string;
  onTaskRegister?(task: OrchestratedTask): void;
  onTaskUnregister?(taskId: string): void;
  onWorkflowRegister?(workflow: Workflow): void;
  onWorkflowUnregister?(name: string, version: string): void;
}

// ─── Pipeline Result & Run Option Contracts ──────────────────────────────────

export interface StepSummary {
  readonly stepId: string;
  readonly taskId: string;
  readonly status: StepStatus;
  readonly latencyMs: number;
  readonly attempts: number;
  readonly error?: Error | undefined;
}

export interface OrchestrationResult<TOutput = any> {
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: string;
  /** True if the workflow completed with all required steps in succeeded status. */
  readonly success: boolean;
  /** Status of the run: completed, failed, cancelled. */
  readonly status: RunStatus;
  /**
   * The nominated output value.
   * Resolved from WorkflowDefinition.outputKey (if declared) or the last step's output.
   */
  readonly output: TOutput | undefined;
  readonly stepSummaries: StepSummary[];
  /** Mapping of step ID to summary. */
  readonly steps: Record<string, StepSummary>;
  readonly totalLatencyMs: number;
  /** Latency of the run in milliseconds. */
  readonly executionTimeMs: number;
  readonly totalTokenUsage: { input: number; output: number };
  readonly totalCostUsd: number;
  readonly warnings: string[];
  readonly errors: Array<{ stepId: string; error: Error }>;
  /** Full execution state for advanced consumers. */
  readonly metadata: {
    readonly shared: Readonly<Record<string, any>>;
    readonly steps: Readonly<Record<string, unknown>>;
  };
}

export interface PipelineRunOptions {
  /** Initial data written to ExecutionState.shared before the first step. */
  readonly initialShared?: Record<string, any>;
  /** AbortSignal for cooperative cancellation of the entire run. */
  readonly signal?: AbortSignal;
}

// ─── Workflow Contract ───────────────────────────────────────────────────────

/**
 * Generic, strongly-typed, provider-agnostic contract interface representing an executable Workflow.
 *
 * It is completely separated from business logic.
 */
export interface Workflow<TInput = any, TOutput = any> {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly steps: StepDefinition[];
  readonly conditions?: ConditionExpression[] | undefined;
  readonly metadata: Record<string, any>;
  readonly outputKey?: string | undefined;
  readonly defaultRetryPolicy?: RetryPolicy | undefined;
  /**
   * Execute the workflow with custom input parameters.
   */
  execute(input: TInput, options?: PipelineRunOptions): Promise<OrchestrationResult<TOutput>>;
}

/** Union type representing any executable workflow structure in the pipeline. */
export type ExecutableWorkflow = WorkflowDefinition | Workflow;

