// =============================================================================
//  CREATE ARTICLE PLANNING WORKFLOW
//  ai/workflow/articlePlanning.workflow.ts
//
//  Design Decisions:
//  - Implements the specialized workflow for article planning.
//  - Leverages Dependency Injection (DI): accepts a PlannerAgent instance.
//  - Completely decoupled from specific LLM providers.
//  - Inherits execution and AbortSignal cancellation behavior from the
//    generic Workflow base engine.
// =============================================================================

import { Workflow } from "./executor";
import { PlannerAgent, type PlannerInput, type PlannerOutline } from "../agent";

export class CreateArticlePlanningWorkflow extends Workflow<PlannerInput, PlannerOutline> {
  /**
   * @param plannerAgent Injected PlannerAgent instance (Dependency Injection).
   */
  constructor(plannerAgent?: PlannerAgent) {
    const agent = plannerAgent || new PlannerAgent();
    super([{ agent }]);
  }
}
