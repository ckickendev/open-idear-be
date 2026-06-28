// =============================================================================
//  AI TELEMETRY — PUBLIC BARREL
//  ai/telemetry/index.ts
//
//  Standardized entry point for the logging and cost calculation subsystem.
// =============================================================================

export {
  type AILogEntry,
  type AILogger,
  type LoggedPrompt,
  type LoggedError,
} from "./types";

export {
  ConsoleAILogger,
  FileAILogger,
  TelemetryLoggerManager,
  aiLogger,
} from "./logger";

export {
  calculateCost,
} from "./costCalculator";
