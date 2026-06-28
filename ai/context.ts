// =============================================================================
//  AI CONTEXT MODULE
//  ai/context.ts
//
//  Responsibilities:
//  1. AIContext interface      — strongly-typed contract for execution context.
//  2. AIContextCollector class — dynamic assembly and validation of context fields.
//  3. Serialization            — formats the gathered context into structured
//                                string representation suitable for prompts.
//
//  Design Decisions:
//  - Keeps all context gathering logic separate from agent execution.
//  - Implements strict validation and defaults (e.g., fallback language is "en").
//  - Decoupled from DB models (e.g., accepts plain structures rather than
//    Mongoose documents) so it can be used anywhere in the server.
//  - Fluent builder pattern for context assembly.
// =============================================================================

/**
 * Strongly-typed container representing the execution environment context
 * for any prompt run.
 */
export interface AIContext {
  /** The target language for generation (default: "en") */
  readonly language: string;
  /** Custom user preferences (e.g. style overrides, writing samples) */
  readonly userPreference?: string;
  /** Category of the article/post (e.g. "Software Engineering", "Cooking") */
  readonly category?: string;
  /** Target reader audience (e.g. "Beginners", "Senior Architects") */
  readonly audience?: string;
  /** Desired output tone (e.g. "Casual", "Authoritative", "Academic") */
  readonly tone?: string;
  /** Target text length description or limit (e.g. "1200 words", "short") */
  readonly length?: string;
  /** Topic/subject of the generation */
  readonly topic?: string;
  /** Custom operational directions appended by the user */
  readonly additionalInstructions?: string;
}

export class AIContextCollector {
  private _language = "en";
  private _userPreference?: string;
  private _category?: string;
  private _audience?: string;
  private _tone?: string;
  private _length?: string;
  private _topic?: string;
  private _additionalInstructions?: string;

  /** Set the target language */
  language(lang: string): this {
    this._language = lang.trim() || "en";
    return this;
  }

  /** Set user preference settings */
  userPreference(pref: string): this {
    this._userPreference = pref.trim();
    return this;
  }

  /** Set the subject category */
  category(cat: string): this {
    this._category = cat.trim();
    return this;
  }

  /** Set target audience */
  audience(aud: string): this {
    this._audience = aud.trim();
    return this;
  }

  /** Set desired writing tone */
  tone(tone: string): this {
    this._tone = tone.trim();
    return this;
  }

  /** Set target word count or length */
  length(len: string): this {
    this._length = len.trim();
    return this;
  }

  /** Set the target topic */
  topic(topic: string): this {
    this._topic = topic.trim();
    return this;
  }

  /** Set custom additional user instructions */
  additionalInstructions(instructions: string): this {
    this._additionalInstructions = instructions.trim();
    return this;
  }

  /**
   * Import parameters from a raw, untyped object (e.g., from request body).
   */
  fromObject(obj: Partial<AIContext>): this {
    if (obj.language) this.language(obj.language);
    if (obj.userPreference) this.userPreference(obj.userPreference);
    if (obj.category) this.category(obj.category);
    if (obj.audience) this.audience(obj.audience);
    if (obj.tone) this.tone(obj.tone);
    if (obj.length) this.length(obj.length);
    if (obj.topic) this.topic(obj.topic);
    if (obj.additionalInstructions) this.additionalInstructions(obj.additionalInstructions);
    return this;
  }

  /**
   * Validates and returns the clean AIContext object.
   */
  build(): AIContext {
    return {
      language: this._language,
      ...(this._userPreference && { userPreference: this._userPreference }),
      ...(this._category && { category: this._category }),
      ...(this._audience && { audience: this._audience }),
      ...(this._tone && { tone: this._tone }),
      ...(this._length && { length: this._length }),
      ...(this._topic && { topic: this._topic }),
      ...(this._additionalInstructions && { additionalInstructions: this._additionalInstructions }),
    };
  }

  /**
   * Formats the context fields as a clean, standardized Markdown list
   * ready to be injected into a prompt block.
   */
  static formatToMarkdown(context: AIContext): string {
    const lines: string[] = [];

    lines.push(`- **Target Language**: ${context.language}`);
    if (context.topic) lines.push(`- **Topic**: ${context.topic}`);
    if (context.tone) lines.push(`- **Tone**: ${context.tone}`);
    if (context.audience) lines.push(`- **Audience**: ${context.audience}`);
    if (context.category) lines.push(`- **Category**: ${context.category}`);
    if (context.length) lines.push(`- **Length**: ${context.length}`);
    if (context.userPreference) lines.push(`- **User Writing Preference**: ${context.userPreference}`);
    if (context.additionalInstructions) {
      lines.push(`- **Additional Instructions**: ${context.additionalInstructions}`);
    }

    return lines.join("\n");
  }
}
