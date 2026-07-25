// =============================================================================
//  AI ORCHESTRATION PLATFORM — ORCHESTRATED WORKFLOW
//  ai/orchestration/workflow/orchestratedWorkflow.ts
//
//  Design Decisions:
//  - Default concrete implementation of the Workflow contract.
//  - Keeps the implementation simple and delegates orchestration steps to
//    OrchestrationPipeline.
//  - Uses Node.js crypto.randomUUID() for unique run IDs.
// =============================================================================

import type {
  Workflow,
  StepDefinition,
  ConditionExpression,
  OrchestrationResult,
  PipelineRunOptions,
} from "../contracts";
import { OrchestrationPipeline } from "../pipeline";
import { taskRegistry } from "../registry";
import { randomUUID } from "crypto";

export class OrchestratedWorkflow<TInput = any, TOutput = any> implements Workflow<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly steps: StepDefinition[];
  readonly conditions?: ConditionExpression[] | undefined;
  readonly metadata: Record<string, any>;
  readonly outputKey?: string | undefined;

  constructor(params: {
    id: string;
    name: string;
    version: string;
    steps: StepDefinition[];
    conditions?: ConditionExpression[];
    metadata?: Record<string, any>;
    outputKey?: string;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.version = params.version;
    this.steps = params.steps;
    this.conditions = params.conditions;
    this.metadata = params.metadata ?? {};
    this.outputKey = params.outputKey;
  }

  async execute(
    input: TInput,
    options?: PipelineRunOptions & { runId?: string }
  ): Promise<OrchestrationResult<TOutput>> {
    const pipeline = new OrchestrationPipeline(taskRegistry);
    const runId = options?.runId ?? randomUUID();
    return pipeline.run<TOutput>(this, runId, {
      initialShared: input as Record<string, any>,
      ...options,
    });
  }
}
