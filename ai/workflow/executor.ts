// =============================================================================
//  AI WORKFLOW — EXECUTOR ENGINE
//  ai/workflow/executor.ts
//
//  Design Decisions:
//  - Coordinates sequential multi-agent execution pipeline.
//  - Leverages Dependency Injection (DI): agents are injected at runtime,
//    meaning the engine is not coupled to any specific agent implementation.
//  - Decoupled from LLMs/providers: only interacts with the Agent layer.
//  - Safe propagation of cancellation signals (AbortSignal).
// =============================================================================

import type { BaseAgent } from "../agent/base.agent";
import type { AgentOptions } from "../agent/types";
import type { WorkflowStage } from "./types";

export class Workflow<TInitialInput = any, TFinalOutput = any> {
  private readonly stages: WorkflowStage[] = [];

  /**
   * @param stages Injected collection of Agent stages to execute sequentially.
   */
  constructor(stages?: WorkflowStage[]) {
    if (stages) {
      this.stages = stages;
    }
  }

  /**
   * Chain a new Agent stage into the workflow.
   *
   * @param agent    The Agent instance to execute.
   * @param mapInput Optional translator mapping previous output to next input.
   */
  addStage<TPrev = any, TNext extends Record<string, any> = Record<string, any>>(
    agent: BaseAgent<TNext, any>,
    mapInput?: (prevOutput: TPrev, initialInput: TInitialInput) => TNext
  ): this {
    this.stages.push({
      agent,
      ...(mapInput !== undefined && { mapInput }),
    });
    return this;
  }

  /**
   * Run the workflow pipeline sequentially: Input -> Agent -> Agent -> Result.
   *
   * @param initialInput Input payload starting the workflow.
   * @param options      Options context containing AbortSignals and overrides.
   */
  async execute(initialInput: TInitialInput, options: AgentOptions = {}): Promise<TFinalOutput> {
    let currentInput: any = initialInput;
    let currentOutput: any = null;

    for (const stage of this.stages) {
      // Check cancellation signal before starting the stage
      options.signal?.throwIfAborted();

      if (stage.mapInput && currentOutput !== null) {
        currentInput = stage.mapInput(currentOutput, initialInput);
      }

      const result = await stage.agent.execute(currentInput, options);
      if (!result.success) {
        throw new Error(
          `Workflow execution halted. Agent "${stage.agent.name}" returned an unsuccessful result.`
        );
      }

      currentOutput = result.data;
    }

    return currentOutput as TFinalOutput;
  }
}
