// =============================================================================
//  PUBLISHING CONTEXT MODULE
//  ai/context/publishing.context.ts
//
//  Strongly-typed context builder for the Publishing Engine.
//  Encapsulates article content, planner/writer outputs, and editorial state.
// =============================================================================

export interface PublishingContext {
  readonly articleTitle: string;
  readonly markdown: string;
  readonly plannerOutput?: any;
  readonly writerOutput?: any;
  readonly editorHistory?: any;
  readonly audience?: string;
  readonly goal?: string;
  readonly tone?: string;
  readonly category?: string;
}

export class PublishingContextBuilder {
  private _articleTitle = "";
  private _markdown = "";
  private _plannerOutput?: any;
  private _writerOutput?: any;
  private _editorHistory?: any;
  private _audience?: string;
  private _goal?: string;
  private _tone?: string;
  private _category?: string;

  articleTitle(title: string): this {
    this._articleTitle = title || "";
    return this;
  }

  markdown(content: string): this {
    this._markdown = content || "";
    return this;
  }

  plannerOutput(output: any): this {
    this._plannerOutput = output;
    return this;
  }

  writerOutput(output: any): this {
    this._writerOutput = output;
    return this;
  }

  editorHistory(history: any): this {
    this._editorHistory = history;
    return this;
  }

  audience(aud: string): this {
    this._audience = aud || "";
    return this;
  }

  goal(goal: string): this {
    this._goal = goal || "";
    return this;
  }

  tone(tone: string): this {
    this._tone = tone || "";
    return this;
  }

  category(cat: string): this {
    this._category = cat || "";
    return this;
  }

  fromObject(obj: Partial<PublishingContext>): this {
    if (obj.articleTitle !== undefined) this.articleTitle(obj.articleTitle);
    if (obj.markdown !== undefined) this.markdown(obj.markdown);
    if (obj.plannerOutput !== undefined) this.plannerOutput(obj.plannerOutput);
    if (obj.writerOutput !== undefined) this.writerOutput(obj.writerOutput);
    if (obj.editorHistory !== undefined) this.editorHistory(obj.editorHistory);
    if (obj.audience !== undefined) this.audience(obj.audience);
    if (obj.goal !== undefined) this.goal(obj.goal);
    if (obj.tone !== undefined) this.tone(obj.tone);
    if (obj.category !== undefined) this.category(obj.category);
    return this;
  }

  build(): PublishingContext {
    return {
      articleTitle: this._articleTitle,
      markdown: this._markdown,
      ...(this._plannerOutput !== undefined && { plannerOutput: this._plannerOutput }),
      ...(this._writerOutput !== undefined && { writerOutput: this._writerOutput }),
      ...(this._editorHistory !== undefined && { editorHistory: this._editorHistory }),
      ...(this._audience !== undefined && { audience: this._audience }),
      ...(this._goal !== undefined && { goal: this._goal }),
      ...(this._tone !== undefined && { tone: this._tone }),
      ...(this._category !== undefined && { category: this._category }),
    };
  }

  static formatToMarkdown(context: PublishingContext): string {
    const lines: string[] = [];
    lines.push(`## Publishing Preflight Context`);
    lines.push(`- **Article Title**: ${context.articleTitle || "Untitled"}`);
    if (context.category) lines.push(`- **Category**: ${context.category}`);
    if (context.audience) lines.push(`- **Target Audience**: ${context.audience}`);
    if (context.tone) lines.push(`- **Desired Tone**: ${context.tone}`);
    if (context.goal) lines.push(`- **Writing Goal**: ${context.goal}`);

    if (context.plannerOutput) {
      lines.push(`\n### Planner Outline Settings:\n\`\`\`json\n${JSON.stringify(context.plannerOutput, null, 2)}\n\`\`\``);
    }
    if (context.writerOutput) {
      lines.push(`\n### Writer Draft Metadata:\n\`\`\`json\n${JSON.stringify(context.writerOutput, null, 2)}\n\`\`\``);
    }
    if (context.editorHistory) {
      lines.push(`\n### Editor Version History:\n\`\`\`json\n${JSON.stringify(context.editorHistory, null, 2)}\n\`\`\``);
    }
    if (context.markdown && context.markdown.trim()) {
      lines.push(`\n### Document Content Preview (Markdown):\n\`\`\`markdown\n${context.markdown.slice(0, 1500)}${context.markdown.length > 1500 ? "\n... [truncated]" : ""}\n\`\`\``);
    }

    return lines.join("\n");
  }
}
