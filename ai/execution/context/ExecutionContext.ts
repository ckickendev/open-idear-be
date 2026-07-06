import type { AIMessage, TokenUsage } from "../../provider/types";
import type { AIConfigScope } from "../../config";
import type { ExecutionPolicy, ExecutionContext } from "../types";
import type { ZodSchema } from "zod";
import { type AITool, type ToolResult, ToolContextContainer, toolRegistry, toolExecutor } from "../../tool";

// =============================================================================
//  DOMAIN CONTEXT INTERFACES
// =============================================================================

export interface UserContext {
  readonly id?: string | undefined;
  readonly role?: string | undefined;
  readonly preference?: string | undefined;
  readonly customInstructions?: string | undefined;
}

export interface PromptContext {
  readonly name: string;
  readonly version: string;
  readonly systemTemplate?: string | undefined;
  readonly userTemplate: string;
  readonly variables: Record<string, any>;
}

export interface ArticleContext {
  readonly id?: string | undefined;
  readonly title: string;
  readonly content: string;
  readonly category?: string | undefined;
  readonly tags?: string[] | undefined;
}

export interface SelectionContext {
  readonly text: string;
  readonly startIndex?: number | undefined;
  readonly endIndex?: number | undefined;
}

export interface EditorContextState {
  readonly cursorOffset?: number | undefined;
  readonly sectionTitle?: string | undefined;
  readonly lastModified?: Date | undefined;
}

export interface PublishingContextState {
  readonly checksPassed?: string[] | undefined;
  readonly validationSeverity?: "info" | "warning" | "error" | undefined;
  readonly isReady?: boolean | undefined;
}

export interface TelemetryMetadata {
  readonly traceId: string;
  readonly spanId: string;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

// =============================================================================
//  EXTENSIBLE EXECUTION CONTEXT CONTAINER
// =============================================================================

export class ExecutionContextContainer implements ExecutionContext {
  readonly id: string;
  readonly timestamp: Date;
  readonly scope: AIConfigScope;
  readonly promptName: string;
  readonly promptVersion: string;
  readonly input: Record<string, any>;
  readonly messages: AIMessage[];
  readonly schema?: ZodSchema<any> | undefined;
  readonly metadata: Record<string, any> = {};
  readonly startTime: number;
  readonly tools?: string[] | undefined;

  responseFormat: "text" | "json" = "text";
  model: string = "fast";
  temperature?: number | undefined;
  maxOutputTokens?: number | undefined;
  signal?: AbortSignal | undefined;
  policy!: ExecutionPolicy;

  retryCount: number = 0;
  providerId: string = "default";
  rawResponse?: string | undefined;
  parsedResponse?: any | undefined;
  tokenUsage?: TokenUsage | undefined;
  estimatedCost?: number | undefined;
  warnings: string[] = [];
  error?: Error | undefined;

  // Domain contexts
  user?: UserContext | undefined;
  promptInfo?: PromptContext | undefined;
  article?: ArticleContext | undefined;
  selection?: SelectionContext | undefined;
  plannerOutput?: any | undefined;
  editorState?: EditorContextState | undefined;
  publishingState?: PublishingContextState | undefined;
  telemetryMetadata?: TelemetryMetadata | undefined;

  constructor(params: {
    readonly id: string;
    readonly scope: AIConfigScope;
    readonly promptName: string;
    readonly promptVersion: string;
    readonly input: Record<string, any>;
    readonly messages: AIMessage[];
    readonly schema?: ZodSchema<any> | undefined;
    readonly startTime: number;
    readonly tools?: string[] | undefined;
  }) {
    this.id = params.id;
    this.timestamp = new Date();
    this.scope = params.scope;
    this.promptName = params.promptName;
    this.promptVersion = params.promptVersion;
    this.input = params.input;
    this.messages = params.messages;
    this.schema = params.schema;
    this.startTime = params.startTime;
    this.tools = params.tools;
  }

  /**
   * Extends the execution context metadata bag with custom engine states.
   */
  extend(key: string, value: any): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Discover all tools authorized for the current execution context scope and user credentials.
   */
  discoverTools(): AITool[] {
    return toolRegistry.findAllowed(this.scope, this.user?.role, this.user?.id);
  }

  /**
   * Safe sandboxed tool execution helper mapping ExecutionContext to ToolContext.
   * Records execution metrics in metadata history logs for telemetry checks.
   */
  async executeTool(name: string, args: unknown): Promise<ToolResult> {
    const toolContext = ToolContextContainer.fromExecutionContext(this);
    const result = await toolExecutor.execute(name, args, toolContext);

    // Append to executions audit logger list inside metadata
    if (!this.metadata.toolExecutions) {
      this.metadata.toolExecutions = [];
    }
    this.metadata.toolExecutions.push({
      toolName: name,
      success: result.success,
      latency: result.latency,
      warnings: result.warnings,
      error: result.error?.message,
    });

    return result;
  }
}
