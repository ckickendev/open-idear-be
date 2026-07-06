import type { ToolContext, ToolResult, AITool } from "./types";
import { toolRegistry } from "./registry";
import { PermissionChecker } from "./permission";
import { aiLogger } from "../telemetry";

export interface ExecutorOptions {
  readonly timeoutMs?: number | undefined;
  readonly resourceOwnerId?: string | undefined;
}

/**
 * Sandboxed runner executing tool operations.
 */
export class ToolExecutor {
  /**
   * Safe execution wrapper coordinating input validation, permissions gating,
   * timeouts racing, cancellation checks, error logs, and telemetry.
   */
  async execute(
    toolName: string,
    args: unknown,
    context: ToolContext,
    options: ExecutorOptions = {}
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 15000; // Default 15s timeout
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    // Hook caller cancel signal
    if (context.signal) {
      context.signal.addEventListener("abort", () => abortController.abort());
    }

    // Set timeout runner
    timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    let parsedArgs: any;
    let tool: AITool | undefined;
    const warnings: string[] = [];

    try {
      tool = toolRegistry.get(toolName);

      // 1. Enforce Permissions validation
      const resourceOwnerId = options.resourceOwnerId || context.metadata.resourceOwnerId;
      const isAllowed = PermissionChecker.isAllowed(tool.permissions, context, resourceOwnerId);
      if (!isAllowed) {
        throw new Error(
          `Permission Denied: Context scope "${context.scope}" and credentials ` +
          `fail security check requirements to run tool "${toolName}".`
        );
      }

      // 2. Validate input parameters against Zod schema
      const parseResult = tool.inputSchema.safeParse(args);
      if (!parseResult.success) {
        throw new Error(
          `Validation Failed: Arguments failed schema verification. Details: ${parseResult.error.message}`
        );
      }
      parsedArgs = parseResult.data;

      // 3. Run execution with raced cancel controller
      const executionPromise = tool.execute(parsedArgs, {
        ...context,
        signal: abortController.signal,
      });

      const output = await Promise.race([
        executionPromise,
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener("abort", () => {
            if (context.signal?.aborted) {
              reject(new Error(`Tool execution was cancelled by the caller.`));
            } else {
              reject(new Error(`Tool execution timed out after ${timeoutMs}ms.`));
            }
          });
        }),
      ]);

      if (timeoutId) clearTimeout(timeoutId);
      const executionTimeMs = Date.now() - startTime;

      // 4. Dispatch Telemetry Logs (Success)
      await this.logTelemetry(tool, parsedArgs, output, executionTimeMs, undefined);

      return {
        success: true,
        data: output,
        metadata: {},
        latency: executionTimeMs,
        warnings,
      };

    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const executionTimeMs = Date.now() - startTime;
      const errorObj = err instanceof Error ? err : new Error(String(err));

      // 4. Dispatch Telemetry Logs (Failure)
      if (tool) {
        await this.logTelemetry(tool, parsedArgs || args, undefined, executionTimeMs, errorObj);
      }

      return {
        success: false,
        metadata: {},
        latency: executionTimeMs,
        warnings,
        error: errorObj,
      };
    }
  }

  /**
   * Helper that records tool execution events to standard telemetry.
   */
  private async logTelemetry(
    tool: AITool,
    args: unknown,
    output: unknown,
    durationMs: number,
    error?: Error
  ): Promise<void> {
    try {
      await aiLogger.log({
        providerId: "tool-executor",
        model: `${tool.name}:${tool.version}`,
        prompt: {
          system: "Tool Execution Interception",
          messages: [{ role: "user", content: JSON.stringify(args) }],
        },
        durationMs,
        ...(output !== undefined && { response: JSON.stringify(output) }),
        ...(error !== undefined && { error }),
        promptName: tool.name,
        promptVersion: tool.version,
      });
    } catch (logErr) {
      console.error(`[ToolExecutor] Telemetry logging failed:`, logErr);
    }
  }
}

export const toolExecutor = new ToolExecutor();
