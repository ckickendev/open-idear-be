// =============================================================================
//  GROWTH CONTEXT MODULE
//  ai/context/growth.context.ts
//
//  Strongly-typed context builder for the Growth Engine.
//  Encapsulates article content, SEO data, tags, and upstream pipeline outputs.
// =============================================================================

export interface GrowthContext {
  readonly articleTitle: string;
  readonly markdown: string;
  readonly metadata?: any;
  readonly seo?: any;
  readonly tags?: string[];
  readonly category?: string;
  readonly audience?: string;
  readonly tone?: string;
  readonly plannerOutput?: any;
  readonly writerOutput?: any;
}

export class GrowthContextBuilder {
  private _articleTitle = "";
  private _markdown = "";
  private _metadata?: any;
  private _seo?: any;
  private _tags?: string[];
  private _category?: string;
  private _audience?: string;
  private _tone?: string;
  private _plannerOutput?: any;
  private _writerOutput?: any;

  articleTitle(title: string): this {
    this._articleTitle = title || "";
    return this;
  }

  markdown(content: string): this {
    this._markdown = content || "";
    return this;
  }

  metadata(meta: any): this {
    this._metadata = meta;
    return this;
  }

  seo(seo: any): this {
    this._seo = seo;
    return this;
  }

  tags(tags: string[]): this {
    this._tags = tags;
    return this;
  }

  category(cat: string): this {
    this._category = cat || "";
    return this;
  }

  audience(aud: string): this {
    this._audience = aud || "";
    return this;
  }

  tone(tone: string): this {
    this._tone = tone || "";
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

  fromObject(obj: Partial<GrowthContext>): this {
    if (obj.articleTitle !== undefined) this.articleTitle(obj.articleTitle);
    if (obj.markdown !== undefined) this.markdown(obj.markdown);
    if (obj.metadata !== undefined) this.metadata(obj.metadata);
    if (obj.seo !== undefined) this.seo(obj.seo);
    if (obj.tags !== undefined) this.tags(obj.tags);
    if (obj.category !== undefined) this.category(obj.category);
    if (obj.audience !== undefined) this.audience(obj.audience);
    if (obj.tone !== undefined) this.tone(obj.tone);
    if (obj.plannerOutput !== undefined) this.plannerOutput(obj.plannerOutput);
    if (obj.writerOutput !== undefined) this.writerOutput(obj.writerOutput);
    return this;
  }

  build(): GrowthContext {
    return {
      articleTitle: this._articleTitle,
      markdown: this._markdown,
      ...(this._metadata !== undefined && { metadata: this._metadata }),
      ...(this._seo !== undefined && { seo: this._seo }),
      ...(this._tags !== undefined && { tags: this._tags }),
      ...(this._category !== undefined && { category: this._category }),
      ...(this._audience !== undefined && { audience: this._audience }),
      ...(this._tone !== undefined && { tone: this._tone }),
      ...(this._plannerOutput !== undefined && { plannerOutput: this._plannerOutput }),
      ...(this._writerOutput !== undefined && { writerOutput: this._writerOutput }),
    };
  }

  static formatToMarkdown(context: GrowthContext): string {
    const lines: string[] = [];
    lines.push(`## Content Growth Context`);
    lines.push(`- **Article Title**: ${context.articleTitle || "Untitled"}`);
    if (context.category) lines.push(`- **Category**: ${context.category}`);
    if (context.audience) lines.push(`- **Target Audience**: ${context.audience}`);
    if (context.tone) lines.push(`- **Desired Tone**: ${context.tone}`);
    if (context.tags && context.tags.length > 0) {
      lines.push(`- **Keywords / Tags**: ${context.tags.join(", ")}`);
    }

    if (context.metadata) {
      lines.push(`\n### Post Metadata:\n\`\`\`json\n${JSON.stringify(context.metadata, null, 2)}\n\`\`\``);
    }
    if (context.seo) {
      lines.push(`\n### SEO Metrics:\n\`\`\`json\n${JSON.stringify(context.seo, null, 2)}\n\`\`\``);
    }
    if (context.plannerOutput) {
      lines.push(`\n### Original Planner Outline:\n\`\`\`json\n${JSON.stringify(context.plannerOutput, null, 2)}\n\`\`\``);
    }
    if (context.writerOutput) {
      lines.push(`\n### Writer Output Data:\n\`\`\`json\n${JSON.stringify(context.writerOutput, null, 2)}\n\`\`\``);
    }
    if (context.markdown && context.markdown.trim()) {
      lines.push(`\n### Article Content (Markdown):\n\`\`\`markdown\n${context.markdown.slice(0, 1500)}${context.markdown.length > 1500 ? "\n... [truncated]" : ""}\n\`\`\``);
    }

    return lines.join("\n");
  }
}
