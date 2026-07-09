// =============================================================================
//  AI TELEMETRY — PUBLIC BARREL
//  ai/telemetry/index.ts
//
//  Standardized entry point for the logging and cost calculation subsystem.
// =============================================================================

export {
  type AILogEntry,
  type AILogSink,
  type LoggedPrompt,
  type LoggedError,
  type TelemetryLogParams,
} from "./types";

export {
  ConsoleAILogSink,
  FileAILogSink,
  TelemetryLogger,
  aiLogger,
} from "./logger";

export {
  calculateCost,
} from "./costCalculator";
