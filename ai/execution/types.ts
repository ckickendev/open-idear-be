import type { AIMessage, TokenUsage } from "../provider/types";
import type { AIConfigScope } from "../config";
import type { ZodSchema } from "zod";

/**
 * Declarative execution policy parameters.
 */
export interface ExecutionPolicy {
  readonly name: string;
  readonly scope: AIConfigScope;
  readonly allowedModels: string[];
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
  readonly timeoutMs: number;
  readonly budgetCap: number; // max cost in USD
  readonly allowStreaming: boolean;
  readonly temperatureOverride?: number | undefined;
}

/**
 * Mutable state container passed through the pipeline.
 */
export interface ExecutionContext {
  readonly id: string;
  readonly timestamp: Date;
  readonly scope: AIConfigScope;
  readonly promptName: string;
  readonly promptVersion: string;
  readonly input: Record<string, any>;
  readonly messages: AIMessage[];
  readonly schema?: ZodSchema<any> | undefined;
  readonly metadata: Record<string, any>;
  readonly startTime: number;
  readonly tools?: string[] | undefined;

  responseFormat: "text" | "json";
  model: string;
  temperature?: number | undefined;
  maxOutputTokens?: number | undefined;
  signal?: AbortSignal | undefined;
  policy: ExecutionPolicy;

  // Outputs & Analytics updated by the pipeline
  retryCount: number;
  providerId: string;
  rawResponse?: string | undefined;
  parsedResponse?: any | undefined;
  tokenUsage?: TokenUsage | undefined;
  estimatedCost?: number | undefined;
  warnings: string[];
  error?: Error | undefined;

  // Domain sub-contexts
  user?: any;
  article?: any;
  selection?: any;
}

/**
 * Structured return payload of pipeline execution.
 */
export interface ExecutionResult<T = any> {
  readonly success: boolean;
  readonly content?: string | undefined;
  readonly data: T;
  readonly tokenUsage?: TokenUsage | undefined;
  readonly executionTimeMs: number;
  readonly retryCount: number;
  readonly warnings: string[];
  readonly estimatedCost: number;
  readonly providerId: string;
  readonly promptVersion: string;
  readonly metadata: Record<string, any>;
  readonly error?: Error | undefined;
}

/**
 * Hook interceptor executed before or after the LLM runtime request.
 */
export interface ExecutionMiddleware {
  readonly name: string;
  before?(context: ExecutionContext): Promise<void> | void;
  after?(context: ExecutionContext): Promise<void> | void;
  /**
   * Called when an error occurs during execution.
   * Return true to indicate the error has been self-healed/handled.
   */
  onError?(context: ExecutionContext, error: Error): Promise<boolean> | boolean;
}

/**
 * Pluggable stage executed as part of the execution pipeline sequence.
 */
export interface ExecutionStage {
  readonly name: string;
  execute(context: ExecutionContext, next: () => Promise<void>): Promise<void>;
}
