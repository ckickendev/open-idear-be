// =============================================================================
//  AI WORKFLOW — TYPES
//  ai/workflow/types.ts
//
//  Design Decisions:
//  - Defines workflow execution blocks (stages) and options.
//  - Kept completely separate from provider APIs to preserve architectural decoupling.
// =============================================================================

import type { BaseAgent } from "../agent/base.agent";

export interface WorkflowStage<TPrevOutput = any, TInitialInput = any, TNextInput extends Record<string, any> = Record<string, any>> {
  /** The concrete Agent instance injected into this stage */
  readonly agent: BaseAgent<TNextInput, any>;
  /**
   * Optional mapper function.
   * Transforms the previous stage output and initial inputs into the format
   * requested by the next Agent.
   */
  readonly mapInput?: (prevOutput: TPrevOutput, initialInput: TInitialInput) => TNextInput;
}
