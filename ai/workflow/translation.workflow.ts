// =============================================================================
//  ARTICLE TRANSLATION WORKFLOW
//  ai/workflow/translation.workflow.ts
//
//  Design Decisions:
//  - Implements the workflow for multilingual article translation.
//  - Accepts TranslatorAgent via Dependency Injection.
//  - Propagates source & target locales cleanly through context.
//  - Output is strictly typed to TranslatorOutput.
// =============================================================================

import { Workflow } from "./executor";
import { TranslatorAgent, type TranslatorInput } from "../agent/translator.agent";
import type { TranslatorOutput } from "../agent/translator.schema";
import type { AgentOptions } from "../agent/types";

export interface ArticleTranslationResult extends TranslatorOutput {
  readonly sourceLocale: string;
  readonly targetLocale: string;
}

export class ArticleTranslationWorkflow extends Workflow<TranslatorInput, ArticleTranslationResult> {
  private readonly agent: TranslatorAgent;

  /**
   * @param translatorAgent Injected TranslatorAgent instance (Dependency Injection).
   */
  constructor(translatorAgent?: TranslatorAgent) {
    const agent = translatorAgent || new TranslatorAgent();
    super([{ agent }]);
    this.agent = agent;
  }

  /**
   * Executes article translation workflow with locale validation and context injection.
   */
  public override async execute(
    input: TranslatorInput,
    options: AgentOptions = {}
  ): Promise<ArticleTranslationResult> {
    const rawTitle = input.sourceTitle || input.title || "";
    const rawContent = input.sourceContent || input.content || "";

    if (!rawTitle.trim() || !rawContent.trim()) {
      throw new Error("Article translation requires non-empty title and content.");
    }

    const sourceLocale = (input.sourceLocale || "en").toLowerCase();
    const targetLocale = (input.targetLocale || "vi").toLowerCase();

    if (sourceLocale === targetLocale) {
      throw new Error("Source locale and target locale must be different for translation.");
    }

    const normalizedInput: TranslatorInput = {
      sourceLocale,
      targetLocale,
      sourceTitle: rawTitle,
      sourceContent: rawContent,
      sourceDescription: input.sourceDescription || input.description || "",
      additionalInstructions: input.additionalInstructions || "",
    };

    const agentResult = await this.agent.execute(normalizedInput, {
      ...options,
      context: {
        ...(options.context || {}),
        language: targetLocale,
      },
    });

    if (!agentResult.success || !agentResult.data) {
      throw new Error("Article translation failed.");
    }

    return {
      ...agentResult.data,
      sourceLocale,
      targetLocale,
    };
  }
}
