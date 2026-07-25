// =============================================================================
//  AI ORCHESTRATION PLATFORM — EXECUTION STATE
//  ai/orchestration/state/index.ts
//
//  Design Decisions:
//  - ExecutionState is the single source of truth for a workflow run.
//  - shared is the free-form inter-step data bag (keyed by StepDefinition.outputKey).
//  - steps records every StepRecord from every executed step.
//  - The container provides typed accessors and mutation helpers.
//  - Serializable by design (AbortSignal excluded from serialized output).
// =============================================================================

import type { StepRecord, StepStatus, RunStatus } from "../contracts";

// ─── Execution State Interface ────────────────────────────────────────────────

/**
 * Public shape of ExecutionState exposed to tasks (read-only view).
 */
export interface ReadonlyExecutionState {
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: string;
  readonly startedAt: number;
  readonly status: RunStatus;
  readonly shared: Readonly<Record<string, any>>;
  readonly steps: Readonly<Record<string, StepRecord>>;
  readonly warnings: readonly string[];
  readonly totalTokenUsage: { input: number; output: number };
  readonly totalCostUsd: number;
  readonly totalLatencyMs: number;
}

// ─── Execution State Container ────────────────────────────────────────────────

/**
 * Mutable shared context for the duration of a single workflow run.
 *
 * ExecutionState is private to the Pipeline. Tasks receive only
 * a ReadonlyExecutionState view and write to shared via outputKey.
 */
export class ExecutionStateContainer {
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: string;
  readonly signal: AbortSignal | undefined;

  startedAt: number;
  status: RunStatus = "pending";

  // Free-form inter-step data bag
  shared: Record<string, any> = {};

  // Step execution records
  steps: Record<string, StepRecord> = {};

  // Aggregated telemetry
  warnings: string[] = [];
  totalInputTokens = 0;
  totalOutputTokens = 0;
  totalCostUsd = 0;
  totalLatencyMs = 0;

  constructor(params: {
    runId: string;
    workflowName: string;
    workflowVersion: string;
    initialShared?: Record<string, any>;
    signal?: AbortSignal;
  }) {
    this.runId = params.runId;
    this.workflowName = params.workflowName;
    this.workflowVersion = params.workflowVersion;
    this.startedAt = Date.now();
    this.shared = { ...params.initialShared };
    if (params.signal !== undefined) {
      this.signal = params.signal;
    }
  }

  /**
   * Serializes the execution state into a plain JSON-serializable checkpoint.
   */
  checkpoint(): Record<string, any> {
    return {
      runId: this.runId,
      workflowName: this.workflowName,
      workflowVersion: this.workflowVersion,
      startedAt: this.startedAt,
      status: this.status,
      shared: JSON.parse(JSON.stringify(this.shared)),
      steps: JSON.parse(JSON.stringify(this.steps)),
      warnings: [...this.warnings],
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCostUsd: this.totalCostUsd,
      totalLatencyMs: this.totalLatencyMs,
    };
  }

  /**
   * Restores a state container instance from a plain checkpoint object.
   */
  static restore(checkpoint: Record<string, any>, signal?: AbortSignal): ExecutionStateContainer {
    const container = new ExecutionStateContainer({
      runId: checkpoint.runId,
      workflowName: checkpoint.workflowName,
      workflowVersion: checkpoint.workflowVersion,
      ...(checkpoint.shared !== undefined && { initialShared: checkpoint.shared }),
      ...(signal !== undefined && { signal }),
    });

    container.startedAt = checkpoint.startedAt;
    container.status = checkpoint.status;
    container.steps = checkpoint.steps;
    container.warnings = checkpoint.warnings;
    container.totalInputTokens = checkpoint.totalInputTokens;
    container.totalOutputTokens = checkpoint.totalOutputTokens;
    container.totalCostUsd = checkpoint.totalCostUsd;
    container.totalLatencyMs = checkpoint.totalLatencyMs;

    return container;
  }

  // ─── Step Lifecycle ─────────────────────────────────────────────────────────

  markStepPending(stepId: string, taskId: string): void {
    this.steps[stepId] = {
      stepId,
      taskId,
      status: "pending",
      input: {},
      latencyMs: 0,
      attempts: 0,
      startedAt: Date.now(),
    };
  }

  markStepRunning(stepId: string, input: Record<string, any>): void {
    const existing = this.steps[stepId];
    this.steps[stepId] = {
      ...(existing ?? { stepId, taskId: stepId, latencyMs: 0, attempts: 0, startedAt: Date.now() }),
      status: "running",
      input,
    };
  }

  markStepSucceeded<TOutput>(
    stepId: string,
    output: TOutput,
    latencyMs: number,
    attempts: number
  ): void {
    const existing = this.steps[stepId];
    this.steps[stepId] = {
      ...(existing ?? { stepId, taskId: stepId, input: {}, startedAt: Date.now() }),
      status: "succeeded",
      output,
      latencyMs,
      attempts,
      completedAt: Date.now(),
    };
  }

  markStepFailed(stepId: string, error: Error, latencyMs: number, attempts: number): void {
    const existing = this.steps[stepId];
    this.steps[stepId] = {
      ...(existing ?? { stepId, taskId: stepId, input: {}, startedAt: Date.now() }),
      status: "failed",
      latencyMs,
      attempts,
      error,
      completedAt: Date.now(),
    };
  }

  markStepSkipped(stepId: string, taskId: string): void {
    this.steps[stepId] = {
      stepId,
      taskId,
      status: "skipped",
      input: {},
      latencyMs: 0,
      attempts: 0,
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
  }

  // ─── Shared State Mutation ──────────────────────────────────────────────────

  writeShared(key: string, value: unknown): void {
    this.shared[key] = value;
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  // ─── Telemetry Accumulators ─────────────────────────────────────────────────

  accumulateTelemetry(params: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    latencyMs?: number;
  }): void {
    if (params.inputTokens !== undefined) this.totalInputTokens += params.inputTokens;
    if (params.outputTokens !== undefined) this.totalOutputTokens += params.outputTokens;
    if (params.costUsd !== undefined) this.totalCostUsd += params.costUsd;
    if (params.latencyMs !== undefined) this.totalLatencyMs += params.latencyMs;
  }

  // ─── Status Helpers ─────────────────────────────────────────────────────────

  getStepStatus(stepId: string): StepStatus | undefined {
    return this.steps[stepId]?.status;
  }

  isStepCompleted(stepId: string): boolean {
    const s = this.getStepStatus(stepId);
    return s === "succeeded" || s === "failed" || s === "skipped";
  }

  // ─── Read-only View ─────────────────────────────────────────────────────────

  toReadonly(): ReadonlyExecutionState {
    return {
      runId: this.runId,
      workflowName: this.workflowName,
      workflowVersion: this.workflowVersion,
      startedAt: this.startedAt,
      status: this.status,
      shared: { ...this.shared },
      steps: { ...this.steps },
      warnings: [...this.warnings],
      totalTokenUsage: {
        input: this.totalInputTokens,
        output: this.totalOutputTokens,
      },
      totalCostUsd: this.totalCostUsd,
      totalLatencyMs: this.totalLatencyMs,
    };
  }
}
