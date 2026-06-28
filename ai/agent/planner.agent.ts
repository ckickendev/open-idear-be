// =============================================================================
//  PLANNER AGENT
//  ai/agent/planner.agent.ts
//
//  Design Decisions:
//  - PlannerAgent specializes in generating article outlines.
//  - Inherits Load Prompt, Build Context, Call Provider, and Telemetry Logging
//    behaviors from BaseAgent.
//  - Implements a custom `validate()` hook using `PlannerSchema` to guarantee
//    output format conformance.
//  - Return data is strongly-typed to `PlannerOutline`.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { PlannerSchema, type PlannerOutline } from "./planner.schema";

export interface PlannerInput extends Record<string, any> {
  readonly topic: string;
  readonly audience: string;
  readonly goal: string;
  readonly tone: string;
  readonly length: string;
  readonly category: string;
}

export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutline> {
  readonly name = "PlannerAgent";
  protected readonly defaultModel = "fast";
  protected readonly promptName = "planner";
  protected readonly responseFormat = "json";
  protected override readonly schema = PlannerSchema;

  /**
   * Enforces semantic and structural validation on the outline response.
   */
  protected override async validate(data: PlannerOutline): Promise<boolean> {
    // 1. Minimum sections check
    if (data.outline.length < 3) {
      console.error("[PlannerAgent] Outline has too few sections (minimum 3 required).");
      return false;
    }

    // 2. Headings structural nesting check: H3 headings must be preceded by an H2 heading
    let hasH2 = false;
    for (const item of data.outline) {
      if (item.level === 2) {
        hasH2 = true;
      } else if (item.level === 3) {
        if (!hasH2) {
          console.error(`[PlannerAgent] Heading structure error: H3 heading "${item.title}" exists before any H2 heading.`);
          return false;
        }
      }
    }

    return true;
  }
}
