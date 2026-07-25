// =============================================================================
//  AI ORCHESTRATION PLATFORM — RESULT
//  ai/orchestration/pipeline/result.ts
//
//  Design Decisions:
//  - OrchestrationResult is the public-facing output of a pipeline run.
//  - Built from ExecutionStateContainer at run completion.
//  - The nominated outputKey is resolved to provide a clean .output accessor.
//  - Raw state is exposed under .metadata for advanced consumers.
// =============================================================================

import type { StepSummary, OrchestrationResult } from "../contracts";
import type { ExecutionStateContainer } from "../state";

// ─── Result Builder ──────────────────────────────────────────────────────────

export class OrchestrationResultBuilder {
  static build<TOutput = any>(
    state: ExecutionStateContainer,
    outputKey?: string
  ): OrchestrationResult<TOutput> {
    const success = state.status === "completed";

    // Resolve nominated output
    const output = OrchestrationResultBuilder.resolveOutput<TOutput>(state, outputKey);

    // Build step summaries
    const stepSummaries: StepSummary[] = Object.values(state.steps).map((record) => ({
      stepId: record.stepId,
      taskId: record.taskId,
      status: record.status,
      latencyMs: record.latencyMs,
      attempts: record.attempts,
      ...(record.error !== undefined && { error: record.error }),
    }));

    // Collect structured errors
    const errors = Object.values(state.steps)
      .filter((r) => r.status === "failed" && r.error !== undefined)
      .map((r) => ({ stepId: r.stepId, error: r.error! }));

    const stepsRecord: Record<string, StepSummary> = {};
    for (const summary of stepSummaries) {
      stepsRecord[summary.stepId] = summary;
    }

    return {
      runId: state.runId,
      workflowName: state.workflowName,
      workflowVersion: state.workflowVersion,
      success,
      status: state.status,
      output,
      stepSummaries,
      steps: stepsRecord,
      totalLatencyMs: state.totalLatencyMs,
      executionTimeMs: state.totalLatencyMs,
      totalTokenUsage: {
        input: state.totalInputTokens,
        output: state.totalOutputTokens,
      },
      totalCostUsd: state.totalCostUsd,
      warnings: [...state.warnings],
      errors,
      metadata: {
        shared: { ...state.shared },
        steps: { ...state.steps },
      },
    };
  }

  private static resolveOutput<TOutput>(
    state: ExecutionStateContainer,
    outputKey?: string
  ): TOutput | undefined {
    // If a nominated key is declared, use it
    if (outputKey !== undefined) {
      return state.shared[outputKey] as TOutput | undefined;
    }

    // Fall back to the last succeeded step's output
    const lastSucceeded = Object.values(state.steps)
      .filter((r) => r.status === "succeeded")
      .at(-1);

    return lastSucceeded?.output as TOutput | undefined;
  }
}
