// =============================================================================
//  AI TELEMETRY — LOGGER
//  ai/telemetry/logger.ts
//
//  Design Decisions:
//  - ConsoleAILogSink provides colorized/styled text output for development.
//  - FileAILogSink writes structured JSON logs to disk for backup/auditing.
//  - TelemetryLogger aggregates multiple sinks, letting the server log to
//    both console and a database/external APM simultaneously.
//  - Single unified `log()` method — no more split between log/logPlatform.
//  - Every logger execution is safely wrapped. A failure in logging must never
//    bubble up and crash the host application.
// =============================================================================

import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { AILogEntry, AILogSink, TelemetryLogParams, LoggedError } from "./types";
import { calculateCost } from "./costCalculator";

// =============================================================================
//  CONSOLE LOG SINK
// =============================================================================

export class ConsoleAILogSink implements AILogSink {
  readonly name = "console";

  async log(entry: AILogEntry): Promise<void> {
    const timestamp = entry.timestamp.toISOString();
    const status = entry.success ? "SUCCESS" : "FAILED";
    const duration = `${entry.executionTimeMs}ms`;
    const cost = entry.estimatedCost ? `$${entry.estimatedCost.toFixed(6)}` : "$0.000000";

    console.log(`[AI LOG] [${timestamp}] [${status}] [${entry.providerId}/${entry.model}] [Time: ${duration}] [Cost: ${cost}]`);

    if (entry.error) {
      console.error(`  - Error [${entry.error.code || "unknown"}]: ${entry.error.message}`);
    } else {
      console.log(`  - Input:  ${entry.prompt.messages.length} messages`);
      console.log(`  - Output: ${entry.responseLength || 0} chars`);
    }
  }
}

// =============================================================================
//  FILE LOG SINK
// =============================================================================

export class FileAILogSink implements AILogSink {
  readonly name = "file";
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), "logs/ai.log");
  }

  async log(entry: AILogEntry): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const logLine = JSON.stringify(entry) + "\n";
      await fs.appendFile(this.filePath, logLine, "utf-8");
    } catch (err) {
      // Fail silently to prevent crashing the host process
      console.error(`[FileAILogSink] Failed to write log line:`, err);
    }
  }
}

// =============================================================================
//  TELEMETRY LOGGER (COORDINATOR)
// =============================================================================

export class TelemetryLogger {
  private readonly sinks = new Map<string, AILogSink>();

  /**
   * Add a logging output sink.
   */
  register(sink: AILogSink): this {
    this.sinks.set(sink.name, sink);
    return this;
  }

  /**
   * Log an AI execution event.
   * Compiles the entry, calculates costs, serializes errors, and forwards
   * the structured entry to all registered sinks concurrently.
   */
  async log(params: TelemetryLogParams): Promise<AILogEntry> {
    const loggedError = this.serializeError(params.error);
    const estimatedCost = calculateCost(params.model, params.usage);

    const entry: AILogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      providerId: params.providerId,
      model: params.model,
      prompt: params.prompt,
      executionTimeMs: params.durationMs,
      success: !params.error,
      ...(params.response !== undefined && {
        response: params.response,
        responseLength: params.response.length,
      }),
      ...(params.usage && { tokenUsage: params.usage }),
      estimatedCost,
      ...(loggedError && { error: loggedError }),
      ...(params.promptName && { promptName: params.promptName }),
      ...(params.promptVersion && { promptVersion: params.promptVersion }),
      ...(params.retryCount !== undefined && { retryCount: params.retryCount }),
      ...(params.validationErrors && { validationErrors: params.validationErrors }),
      ...(params.streamingDurationMs !== undefined && { streamingDurationMs: params.streamingDurationMs }),
    };

    await this.forwardToSinks(entry);
    return entry;
  }

  /**
   * Serializes an error into a flat, JSON-safe structure.
   */
  private serializeError(error: unknown): LoggedError | undefined {
    if (!error) return undefined;
    const errObj = error as any;
    return {
      message: errObj.message || String(error),
      code: errObj.code,
      stack: errObj.stack,
      raw: error,
    };
  }

  /**
   * Forwards a log entry to all registered sinks concurrently.
   * Failures in individual sinks are caught and logged to stderr.
   */
  private async forwardToSinks(entry: AILogEntry): Promise<void> {
    const promises = Array.from(this.sinks.values()).map(async (sink) => {
      try {
        await sink.log(entry);
      } catch (err) {
        console.error(`[TelemetryLogger] Sink "${sink.name}" failed:`, err);
      }
    });
    await Promise.all(promises);
  }
}

// Export default instance configured with Console and File sinks
export const aiLogger = new TelemetryLogger()
  .register(new ConsoleAILogSink())
  .register(new FileAILogSink());
