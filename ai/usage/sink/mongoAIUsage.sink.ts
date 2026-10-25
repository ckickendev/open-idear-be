// =============================================================================
//  MONGO AI USAGE SINK (RUNTIME INTERCEPTOR)
//  ai/usage/sink/mongoAIUsage.sink.ts
//
//  Design Decisions:
//  - Implements AILogSink to automatically intercept all AI execution events
//    (both SUCCESS and FAILED) dispatched through the Telemetry Logger.
//  - Pluggable and decoupled: Zero duplication of logging calls across individual agents.
//  - Non-blocking: Failures in persisting usage analytics are safely caught and logged
//    without interrupting LLM request completions or failing caller responses.
// =============================================================================

import type { AILogEntry, AILogSink } from "../../telemetry";
import { aiUsageService } from "../service/aiUsage.service";
import { aiFeatureRegistry } from "../../feature";

export class MongoAIUsageSink implements AILogSink {
  readonly name = "mongo-ai-usage";

  /**
   * Automatically intercept execution logs and write to AIUsage collection.
   */
  async log(entry: AILogEntry): Promise<void> {
    try {
      // 1. Resolve canonical featureId (from entry.featureId or promptName fallback)
      let featureId = entry.featureId;
      if (!featureId && entry.promptName) {
        const resolved = aiFeatureRegistry.find(entry.promptName);
        featureId = resolved?.id || entry.promptName;
      }
      if (!featureId) {
        featureId = "unknown";
      }

      // 2. Extract token statistics
      const inputTokens = entry.tokenUsage?.promptTokens || 0;
      const outputTokens = entry.tokenUsage?.completionTokens || 0;
      const totalTokens =
        entry.tokenUsage?.totalTokens !== undefined
          ? entry.tokenUsage.totalTokens
          : inputTokens + outputTokens;

      // 3. Delegate to AIUsageService
      await aiUsageService.recordUsage({
        userId: entry.userId || null,
        featureId,
        provider: entry.providerId || "default",
        promptVersion: entry.promptVersion || "v1",
        inputTokens,
        outputTokens,
        totalTokens,
        latency: Math.max(0, Math.round(entry.executionTimeMs || 0)),
        estimatedCostUSD: entry.estimatedCost || 0,
        status: entry.success ? "SUCCESS" : "FAILED",
        errorMessage: entry.error?.message,
        model: entry.model,
        createdAt: entry.timestamp,
      });
    } catch (err) {
      // Non-blocking: Never let analytics write errors break the primary model response
      console.error("[MongoAIUsageSink] Failed to persist AI usage event to MongoDB:", err);
    }
  }
}

export const mongoAIUsageSink = new MongoAIUsageSink();
