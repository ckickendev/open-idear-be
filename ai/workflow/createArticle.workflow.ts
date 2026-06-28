// =============================================================================
//  CREATE ARTICLE WORKFLOW
//  ai/workflow/createArticle.workflow.ts
//
//  Design Decisions:
//  - Implements the specialized workflow for article drafting.
//  - Leverages Dependency Injection (DI): accepts a WriterAgent instance.
//  - Completely decoupled from specific LLM providers.
//  - Inherits execution and AbortSignal cancellation behavior from the
//    generic Workflow base engine.
// =============================================================================

import { Workflow } from "./executor";
import { WriterAgent, type WriterInput, type WriterOutput } from "../agent";

export class CreateArticleWorkflow extends Workflow<WriterInput, WriterOutput> {
  /**
   * @param writerAgent Injected WriterAgent instance (Dependency Injection).
   */
  constructor(writerAgent?: WriterAgent) {
    const agent = writerAgent || new WriterAgent();
    super([{ agent }]);
  }
}
