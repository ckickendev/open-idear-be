// =============================================================================
//  AI ORCHESTRATION PLATFORM — PIPELINE ENGINE
//  ai/orchestration/pipeline/pipeline.ts
//
//  Design Decisions:
//  - Stateless executor: receives definition + state + registry, returns final state.
//  - Resolves execution order via dependsOn graph (topological sort).
//  - Parallel steps (parallel: true) sharing the same resolved dependencies
//    execute concurrently via Promise.allSettled().
//  - Conditions are evaluated by ConditionEvaluator before each step.
//  - Retry logic is applied per-step using the resolved RetryPolicy.
//  - Lifecycle events emitted via Node.js EventEmitter (in-process, swappable).
//  - Input and output are Zod-validated at each step boundary.
//  - Cancellation is cooperative: AbortSignal is checked before each step.
// =============================================================================

import { EventEmitter } from "events";
import type {
  ExecutableWorkflow,
  StepDefinition,
  RetryPolicy,
  OrchestratedTask,
  OrchestrationResult,
  PipelineRunOptions,
} from "../contracts";
import { taskRegistry, workflowRegistry } from "../registry";
import { ExecutionStateContainer } from "../state";
import { ConditionEvaluator } from "../condition";
import { OrchestrationResultBuilder } from "./result";

// ─── Pipeline Events ─────────────────────────────────────────────────────────

export type PipelineEventMap = {
  "workflow.started": [{ runId: string; workflowName: string; workflowVersion: string }];
  "workflow.completed": [{ runId: string; success: boolean; totalLatencyMs: number }];
  "workflow.failed": [{ runId: string; error: Error }];
  "step.started": [{ runId: string; stepId: string; taskId: string }];
  "step.completed": [{ runId: string; stepId: string; latencyMs: number; attempts: number }];
  "step.failed": [{ runId: string; stepId: string; error: Error; attempts: number }];
  "step.skipped": [{ runId: string; stepId: string }];
  "step.retrying": [{ runId: string; stepId: string; attempt: number; delayMs: number }];
};

// ─── Orchestration Pipeline ───────────────────────────────────────────────────

export class OrchestrationPipeline extends EventEmitter {
  private readonly taskRegistry;

  constructor(taskRegistryInstance = taskRegistry) {
    super();
    this.taskRegistry = taskRegistryInstance;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Execute a WorkflowDefinition or Workflow instance, loading it by name from
   * the registry if a string is provided.
   *
   * @param workflowOrName  The workflow plan, instance, or registry name to execute.
   * @param runId           Unique identifier for this run.
   * @param options         Runtime options (initial data, cancellation signal, version).
   */
  async run<TOutput = any>(
    workflowOrName: ExecutableWorkflow | string,
    runId: string,
    options: PipelineRunOptions & { version?: string } = {}
  ): Promise<OrchestrationResult<TOutput>> {
    // Load Workflow if name is provided
    const workflow =
      typeof workflowOrName === "string"
        ? workflowRegistry.resolve(workflowOrName, options.version)
        : workflowOrName;

    // Validate all task ids are resolvable before starting
    this.validateTaskIds(workflow);

    const state = new ExecutionStateContainer({
      runId,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      ...(options.initialShared !== undefined && { initialShared: options.initialShared }),
      ...(options.signal !== undefined && { signal: options.signal }),
    });

    state.status = "running";
    this.emit("workflow.started", {
      runId,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
    });

    try {
      await this.executeSteps(workflow, state);
      state.status = "completed";
      this.emit("workflow.completed", {
        runId,
        success: true,
        totalLatencyMs: state.totalLatencyMs,
      });
    } catch (err: any) {
      state.status = state.signal?.aborted ? "cancelled" : "failed";
      this.emit("workflow.failed", { runId, error: err });
    }

    return OrchestrationResultBuilder.build<TOutput>(state, workflow.outputKey);
  }

  // ─── Step Execution ──────────────────────────────────────────────────────────

  private async executeSteps(
    workflow: ExecutableWorkflow,
    state: ExecutionStateContainer
  ): Promise<void> {
    // Build dependency-resolved execution waves (topological groups)
    const waves = this.buildExecutionWaves(workflow);

    for (const wave of waves) {
      // Check cancellation before each wave
      state.signal?.throwIfAborted();

      if (wave.length === 1) {
        // Single step — execute directly
        await this.executeStep(wave[0]!, workflow, state);
      } else {
        // Multiple parallel-flagged steps in the same wave
        await this.executeParallelSteps(wave, workflow, state);
      }
    }
  }

  private async executeParallelSteps(
    steps: StepDefinition[],
    workflow: ExecutableWorkflow,
    state: ExecutionStateContainer
  ): Promise<void> {
    const results = await Promise.allSettled(
      steps.map((step) => this.executeStep(step, workflow, state))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const step = steps[i]!;
      if (result.status === "rejected" && !step.continueOnFailure) {
        throw result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
      }
    }
  }

  private async executeStep(
    step: StepDefinition,
    workflow: ExecutableWorkflow,
    state: ExecutionStateContainer
  ): Promise<void> {
    state.markStepPending(step.id, step.taskId);

    // Evaluate condition — skip if false
    if (step.condition !== undefined) {
      const passes = ConditionEvaluator.evaluate(step.condition, state.shared, state.steps);
      if (!passes) {
        state.markStepSkipped(step.id, step.taskId);
        this.emit("step.skipped", { runId: state.runId, stepId: step.id });
        return;
      }
    }

    const task = this.taskRegistry.resolve(step.taskId) as OrchestratedTask;
    const retryPolicy = this.resolveRetryPolicy(step, workflow, task);

    // Resolve and validate input
    const rawInput = step.inputMapping
      ? step.inputMapping(state.shared)
      : state.shared;

    const parseResult = task.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const error = new Error(
        `[Pipeline] Step "${step.id}" input validation failed: ${parseResult.error.message}`
      );
      state.markStepFailed(step.id, error, 0, 0);
      this.emit("step.failed", { runId: state.runId, stepId: step.id, error, attempts: 0 });
      if (!step.continueOnFailure) throw error;
      return;
    }

    const validInput = parseResult.data;
    state.markStepRunning(step.id, validInput as Record<string, any>);
    this.emit("step.started", { runId: state.runId, stepId: step.id, taskId: step.taskId });

    // Execute with retry
    const stepStart = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      attempts = attempt;
      state.signal?.throwIfAborted();

      try {
        const output = await this.executeWithTimeout(
          task,
          validInput,
          state,
          retryPolicy.timeoutMs
        );

        // Validate output
        const outputParse = task.outputSchema.safeParse(output);
        if (!outputParse.success) {
          throw new Error(
            `[Pipeline] Step "${step.id}" output validation failed: ${outputParse.error.message}`
          );
        }

        const latencyMs = Date.now() - stepStart;
        state.markStepSucceeded(step.id, outputParse.data, latencyMs, attempts);
        state.accumulateTelemetry({ latencyMs });

        // Write to shared under the nominated output key
        if (step.outputKey !== undefined) {
          state.writeShared(step.outputKey, outputParse.data);
        }

        this.emit("step.completed", {
          runId: state.runId,
          stepId: step.id,
          latencyMs,
          attempts,
        });
        return;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retryPolicy.maxAttempts) {
          const delayMs =
            retryPolicy.initialDelayMs *
            Math.pow(retryPolicy.backoffMultiplier, attempt - 1);

          this.emit("step.retrying", {
            runId: state.runId,
            stepId: step.id,
            attempt,
            delayMs,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All attempts exhausted
    const latencyMs = Date.now() - stepStart;
    const finalError = lastError ?? new Error(`[Pipeline] Step "${step.id}" failed.`);
    state.markStepFailed(step.id, finalError, latencyMs, attempts);
    state.accumulateTelemetry({ latencyMs });
    this.emit("step.failed", {
      runId: state.runId,
      stepId: step.id,
      error: finalError,
      attempts,
    });

    if (!step.continueOnFailure) throw finalError;
  }

  // ─── Timeout Racing ──────────────────────────────────────────────────────────

  private executeWithTimeout<TInput, TOutput>(
    task: OrchestratedTask<TInput, TOutput>,
    input: TInput,
    state: ExecutionStateContainer,
    timeoutMs: number
  ): Promise<TOutput> {
    const executionPromise = task.execute(
      input,
      state.shared,
      state.signal
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[Pipeline] Task "${task.id}" timed out after ${timeoutMs}ms.`)),
        timeoutMs
      )
    );

    return Promise.race([executionPromise, timeoutPromise]);
  }

  // ─── Execution Wave Builder ──────────────────────────────────────────────────

  /**
   * Groups steps into ordered execution waves based on dependsOn declarations.
   * Steps within the same wave may execute in parallel if parallel: true.
   *
   * Wave 0: all steps with no dependsOn
   * Wave 1: all steps whose dependsOn are fully in wave 0
   * Wave N: all steps whose dependsOn are fully in waves 0..N-1
   */
  private buildExecutionWaves(workflow: ExecutableWorkflow): StepDefinition[][] {
    const waves: StepDefinition[][] = [];
    const placed = new Set<string>();
    const remaining = [...workflow.steps];

    while (remaining.length > 0) {
      const wave: StepDefinition[] = [];
      const notYetPlaced: StepDefinition[] = [];

      for (const step of remaining) {
        const deps = step.dependsOn ?? [];
        const allDepsPlaced = deps.every((d) => placed.has(d));
        if (allDepsPlaced) {
          wave.push(step);
        } else {
          notYetPlaced.push(step);
        }
      }

      if (wave.length === 0) {
        // Guard: should never reach here after WorkflowRegistry cycle detection
        throw new Error(
          `[Pipeline] Could not resolve execution order for workflow "${workflow.name}". ` +
            `Possible unresolved dependency cycle.`
        );
      }

      // Within a wave, split parallel and sequential steps
      const parallelSteps = wave.filter((s) => s.parallel === true);
      const sequentialSteps = wave.filter((s) => s.parallel !== true);

      // Parallel steps run as a single wave
      if (parallelSteps.length > 0) waves.push(parallelSteps);
      // Sequential steps each get their own wave
      for (const step of sequentialSteps) waves.push([step]);

      wave.forEach((s) => placed.add(s.id));
      remaining.length = 0;
      remaining.push(...notYetPlaced);
    }

    return waves;
  }

  // ─── Policy Resolution ────────────────────────────────────────────────────────

  private resolveRetryPolicy(
    step: StepDefinition,
    workflow: ExecutableWorkflow,
    task: OrchestratedTask
  ): RetryPolicy {
    // Priority: step-level > workflow-level > task default
    return (
      step.retryPolicy ??
      workflow.defaultRetryPolicy ??
      task.defaultRetryPolicy
    );
  }

  // ─── Pre-flight Validation ───────────────────────────────────────────────────

  private validateTaskIds(workflow: ExecutableWorkflow): void {
    const missing = workflow.steps
      .map((s) => s.taskId)
      .filter((id) => !this.taskRegistry.has(id));

    if (missing.length > 0) {
      throw new Error(
        `[Pipeline] Workflow "${workflow.name}" references unregistered tasks: ` +
          `[${missing.join(", ")}]. Register them in TaskRegistry before running.`
      );
    }
  }
}
