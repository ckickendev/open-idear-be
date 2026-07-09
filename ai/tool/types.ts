import type { ZodSchema } from "zod";
import type { AIConfigScope } from "../config";

export type ToolRole = "public" | "authenticated" | "owner" | "admin" | string;

/**
 * Access control policies for tool execution.
 */
export interface ToolPermission {
  readonly allowedScopes: AIConfigScope[] | "*"; // Scopes allowed to call this tool
  readonly requiredRole: ToolRole; // Required role clearance to call this tool
}

export interface ToolUserContext {
  readonly id?: string | undefined;
  readonly role?: string | undefined;
  readonly preference?: string | undefined;
}

export interface ToolArticleContext {
  readonly id?: string | undefined;
  readonly title: string;
  readonly content: string;
  readonly category?: string | undefined;
}

export interface ToolSelectionContext {
  readonly text: string;
  readonly startIndex?: number | undefined;
  readonly endIndex?: number | undefined;
}

export interface ToolWorkspaceContext {
  readonly workspacePath: string;
  readonly corpusName?: string | undefined;
}

export interface ToolExecutionMetadata {
  readonly traceId: string;
  readonly scope: AIConfigScope;
  readonly startTime: number;
}

/**
 * Execution details injected into the tool during invoke runs.
 */
export interface ToolContext {
  readonly traceId: string;
  readonly scope: AIConfigScope;
  readonly userRole?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly metadata: Record<string, any>;

  // Sub-domain context items
  readonly user?: ToolUserContext | undefined;
  readonly article?: ToolArticleContext | undefined;
  readonly selection?: ToolSelectionContext | undefined;
  readonly workspace?: ToolWorkspaceContext | undefined;
  readonly execution?: ToolExecutionMetadata | undefined;
}

/**
 * Unified response return shape from the ToolExecutor.
 */
export interface ToolResult<T = any> {
  readonly success: boolean;
  readonly data?: T | undefined;
  readonly metadata: Record<string, any>;
  readonly latency: number; // latency in ms
  readonly warnings: string[];
  readonly error?: Error | undefined;
}

/**
 * Generic, strongly-typed, provider-agnostic contract interface representing a pluggable AI Tool.
 */
export interface AITool<TInput = any, TOutput = any> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category?: string | undefined;
  readonly tags?: string[] | undefined;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  readonly permissions: ToolPermission;
  execute(args: TInput, context: ToolContext): Promise<TOutput>;
}
