// =============================================================================
//  AI TELEMETRY — LOGGER LOGIC
//  ai/telemetry/logger.ts
//
//  Design Decisions:
//  - Implements AILogger interface for multiple output sinks.
//  - ConsoleAILogger provides colorized/styled text output for development.
//  - FileAILogger writes structured logs to disk (e.g. log/ai.log) for backup.
//  - TelemetryLoggerManager aggregates multiple sinks, letting the server log to
//    both console and a database/external APM simultaneously.
//  - Every logger execution is safely wrapped. A failure in logging must never
//    bubble up and crash the host application.
// =============================================================================

import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { AILogEntry, AILogger, LoggedPrompt, LoggedError } from "./types";
import type { TokenUsage } from "../provider/types";
import { calculateCost } from "./costCalculator";

// =============================================================================
//  CONSOLE LOGGER
// =============================================================================

export class ConsoleAILogger implements AILogger {
  readonly name = "console";

  async log(entry: AILogEntry): Promise<void> {
    const timestamp = entry.timestamp.toISOString();
    const status = entry.error ? "FAILED" : "SUCCESS";
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
//  FILE LOGGER
// =============================================================================

export class FileAILogger implements AILogger {
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
      console.error(`[FileAILogger] Failed to write log line:`, err);
    }
  }
}

// =============================================================================
//  TELEMETRY LOGGER MANAGER (COORDINATOR)
// =============================================================================

export class TelemetryLoggerManager {
  private readonly sinks = new Map<string, AILogger>();

  /**
   * Add a logging output sink.
   */
  register(logger: AILogger): this {
    this.sinks.set(logger.name, logger);
    return this;
  }

  /**
   * Log an AI execution event.
   * Compiles the entry metrics, calculates costs, and forwards the entry
   * to all registered loggers asynchronously.
   *
   * @param providerId Target provider name (e.g. "gemini")
   * @param model      Target model name (e.g. "gemini-2.0-flash")
   * @param prompt     Raw system instruction and conversation array
   * @param durationMs Duration of execution in milliseconds
   * @param response   Successful model text response (if any)
   * @param usage      Model token usage report (if any)
   * @param error      Execution exception (if any)
   */
  async log(
    providerId: string,
    model: string,
    prompt: LoggedPrompt,
    durationMs: number,
    response?: string,
    usage?: TokenUsage,
    error?: unknown
  ): Promise<AILogEntry> {
    let loggedError: LoggedError | undefined;

    if (error) {
      const errObj = error as any;
      loggedError = {
        message: errObj.message || String(error),
        code: errObj.code,
        stack: errObj.stack,
        raw: error,
      };
    }

    const estimatedCost = calculateCost(model, usage);

    const entry: AILogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      providerId,
      model,
      prompt,
      executionTimeMs: durationMs,
      ...(response !== undefined && {
        response,
        responseLength: response.length,
      }),
      ...(usage && { tokenUsage: usage }),
      estimatedCost,
      ...(loggedError && { error: loggedError }),
    };

    // Forward to all registered sinks concurrently
    const promises = Array.from(this.sinks.values()).map(async (sink) => {
      try {
        await sink.log(entry);
      } catch (err) {
        console.error(`[TelemetryLoggerManager] Sink "${sink.name}" failed:`, err);
      }
    });

    await Promise.all(promises);
    return entry;
  }
}

// Export default instance configured with Console and File logger
export const aiLogger = new TelemetryLoggerManager()
  .register(new ConsoleAILogger())
  .register(new FileAILogger());
