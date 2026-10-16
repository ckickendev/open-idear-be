// =============================================================================
//  TRANSLATOR AGENT
//  ai/agent/translator.agent.ts
//
//  Design Decisions:
//  - Translates technical articles between English and Vietnamese.
//  - Inherits BaseAgent execution, prompt interpolation, and telemetry logging.
//  - Enforces schema validation through TranslatorSchema.
//  - Uses "quality" model tier for nuanced technical linguistic accuracy.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { TranslatorSchema, type TranslatorOutput } from "./translator.schema";

export interface TranslatorInput extends Record<string, any> {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceTitle: string;
  readonly sourceContent: string;
  readonly sourceDescription?: string;
  readonly additionalInstructions?: string;
}

export class TranslatorAgent extends BaseAgent<TranslatorInput, TranslatorOutput> {
  public override readonly name = "TranslatorAgent";
  protected override readonly defaultModel = "quality";
  protected override readonly promptName = "translator";
  protected override readonly responseFormat = "json" as const;
  protected override readonly schema = TranslatorSchema;

  /**
   * Enforces semantic and structural validation on the translated output.
   */
  protected override async validate(data: TranslatorOutput): Promise<boolean> {
    if (!data || !data.title || !data.title.trim()) {
      console.error("[TranslatorAgent] Validation failed: missing translated title.");
      return false;
    }
    if (!data.content || !data.content.trim()) {
      console.error("[TranslatorAgent] Validation failed: missing translated content.");
      return false;
    }
    if (!data.slug || !data.slug.trim()) {
      console.error("[TranslatorAgent] Validation failed: missing translated slug.");
      return false;
    }
    return true;
  }
}
