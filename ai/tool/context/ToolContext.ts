import type { AIConfigScope } from "../../config";
import type { ExecutionContext } from "../../execution/types";
import type {
  ToolContext,
  ToolUserContext,
  ToolArticleContext,
  ToolSelectionContext,
  ToolWorkspaceContext,
  ToolExecutionMetadata,
} from "../types";

/**
 * Extensible, concrete context container passed to tool execution handlers.
 */
export class ToolContextContainer implements ToolContext {
  readonly traceId: string;
  readonly scope: AIConfigScope;
  readonly userRole?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  metadata: Record<string, any> = {};

  // Sub-domains
  user?: ToolUserContext | undefined;
  article?: ToolArticleContext | undefined;
  selection?: ToolSelectionContext | undefined;
  workspace?: ToolWorkspaceContext | undefined;
  execution?: ToolExecutionMetadata | undefined;

  constructor(params: {
    readonly traceId: string;
    readonly scope: AIConfigScope;
    readonly userRole?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  }) {
    this.traceId = params.traceId;
    this.scope = params.scope;
    this.userRole = params.userRole;
    this.signal = params.signal;
  }

  /**
   * Factory function mapping an ExecutionContext state directly into a ToolContext.
   */
  static fromExecutionContext(ctx: ExecutionContext): ToolContextContainer {
    const container = new ToolContextContainer({
      traceId: ctx.id,
      scope: ctx.scope,
      userRole: ctx.user?.role || undefined,
      signal: ctx.signal || undefined,
    });

    container.metadata = {
      userId: ctx.user?.id,
      ...ctx.metadata,
    };

    if (ctx.user) {
      container.user = {
        id: ctx.user.id,
        role: ctx.user.role,
        preference: ctx.user.preference,
      };
    }

    if (ctx.article) {
      container.article = {
        id: ctx.article.id,
        title: ctx.article.title,
        content: ctx.article.content,
        category: ctx.article.category,
      };
    }

    if (ctx.selection) {
      container.selection = {
        text: ctx.selection.text,
        startIndex: ctx.selection.startIndex,
        endIndex: ctx.selection.endIndex,
      };
    }

    container.workspace = {
      workspacePath: ctx.metadata?.workspacePath || process.cwd(),
      corpusName: ctx.metadata?.corpusName,
    };

    container.execution = {
      traceId: ctx.id,
      scope: ctx.scope,
      startTime: ctx.startTime,
    };

    return container;
  }

  /**
   * Dynamic extension hook to attach engine-specific state.
   */
  extend(key: string, value: any): this {
    this.metadata[key] = value;
    return this;
  }
}
