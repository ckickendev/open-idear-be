// =============================================================================
//  EDITOR CONTEXT MODULE
//  ai/context/editor.context.ts
//
//  Strongly-typed context builder for the Editor Copilot engine.
//  Encapsulates article state, cursor position, and selection data.
// =============================================================================

export interface EditorContext {
  readonly currentArticle: string;
  readonly selectedText?: string;
  readonly cursorPosition?: number | { offset: number; nodeType?: string };
  readonly sectionTitle?: string;
  readonly articleTitle: string;
  readonly audience?: string;
  readonly tone?: string;
  readonly goal?: string;
  readonly plannerResult?: any;
}

export class EditorContextBuilder {
  private _currentArticle = "";
  private _selectedText?: string;
  private _cursorPosition?: number | { offset: number; nodeType?: string };
  private _sectionTitle?: string;
  private _articleTitle = "";
  private _audience?: string;
  private _tone?: string;
  private _goal?: string;
  private _plannerResult?: any;

  currentArticle(content: string): this {
    this._currentArticle = content || "";
    return this;
  }

  selectedText(text: string): this {
    this._selectedText = text || "";
    return this;
  }

  cursorPosition(pos: number | { offset: number; nodeType?: string }): this {
    this._cursorPosition = pos;
    return this;
  }

  sectionTitle(title: string): this {
    this._sectionTitle = title || "";
    return this;
  }

  articleTitle(title: string): this {
    this._articleTitle = title || "";
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

  goal(goal: string): this {
    this._goal = goal || "";
    return this;
  }

  plannerResult(result: any): this {
    this._plannerResult = result;
    return this;
  }

  fromObject(obj: Partial<EditorContext>): this {
    if (obj.currentArticle !== undefined) this.currentArticle(obj.currentArticle);
    if (obj.selectedText !== undefined) this.selectedText(obj.selectedText);
    if (obj.cursorPosition !== undefined) this.cursorPosition(obj.cursorPosition);
    if (obj.sectionTitle !== undefined) this.sectionTitle(obj.sectionTitle);
    if (obj.articleTitle !== undefined) this.articleTitle(obj.articleTitle);
    if (obj.audience !== undefined) this.audience(obj.audience);
    if (obj.tone !== undefined) this.tone(obj.tone);
    if (obj.goal !== undefined) this.goal(obj.goal);
    if (obj.plannerResult !== undefined) this.plannerResult(obj.plannerResult);
    return this;
  }

  build(): EditorContext {
    return {
      currentArticle: this._currentArticle,
      articleTitle: this._articleTitle,
      ...(this._selectedText !== undefined && { selectedText: this._selectedText }),
      ...(this._cursorPosition !== undefined && { cursorPosition: this._cursorPosition }),
      ...(this._sectionTitle !== undefined && { sectionTitle: this._sectionTitle }),
      ...(this._audience !== undefined && { audience: this._audience }),
      ...(this._tone !== undefined && { tone: this._tone }),
      ...(this._goal !== undefined && { goal: this._goal }),
      ...(this._plannerResult !== undefined && { plannerResult: this._plannerResult }),
    };
  }

  static formatToMarkdown(context: EditorContext): string {
    const lines: string[] = [];
    lines.push(`## Editor Situational Context`);
    lines.push(`- **Article Title**: ${context.articleTitle || "Untitled"}`);
    if (context.sectionTitle) lines.push(`- **Current Section**: ${context.sectionTitle}`);
    if (context.goal) lines.push(`- **Writing Goal**: ${context.goal}`);
    if (context.audience) lines.push(`- **Target Audience**: ${context.audience}`);
    if (context.tone) lines.push(`- **Desired Tone**: ${context.tone}`);

    if (context.cursorPosition) {
      const posStr = typeof context.cursorPosition === "number"
        ? `character offset ${context.cursorPosition}`
        : `offset ${context.cursorPosition.offset}${context.cursorPosition.nodeType ? ` (node: ${context.cursorPosition.nodeType})` : ""}`;
      lines.push(`- **Cursor Position**: ${posStr}`);
    }

    if (context.selectedText && context.selectedText.trim()) {
      lines.push(`\n### Selected Text Block:\n\`\`\`\n${context.selectedText}\n\`\`\``);
    }

    if (context.plannerResult) {
      lines.push(`\n### Planned Outline Structure:\n\`\`\`json\n${JSON.stringify(context.plannerResult, null, 2)}\n\`\`\``);
    }

    if (context.currentArticle && context.currentArticle.trim()) {
      lines.push(`\n### Full Document Text:\n\`\`\`markdown\n${context.currentArticle}\n\`\`\``);
    }

    return lines.join("\n");
  }
}
