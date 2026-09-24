// =============================================================================
//  AI USAGE ANALYTICS — DATA TRANSFER OBJECTS (DTOs)
//  ai/usage/dto/aiUsage.dto.ts
//
//  Design Decisions:
//  - Clean, typed contracts decoupled from Mongoose internal documents.
//  - Strict DTO representations for user summary and administrative analytics.
//  - Enforces strong TypeScript literal types across layer boundaries.
// =============================================================================

import type { AIFeatureId } from "../../feature";

export type AIExecutionStatus = "SUCCESS" | "FAILED";

/**
 * Payload contract for creating a single AI usage record.
 */
export interface CreateAIUsageDTO {
  readonly userId?: string | null | undefined;
  readonly featureId: AIFeatureId | string;
  readonly provider: string;
  readonly promptVersion?: string | undefined;
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly latency: number;
  readonly estimatedCostUSD?: number | undefined;
  readonly status: AIExecutionStatus;
  readonly errorMessage?: string | undefined;
  readonly model?: string | undefined;
  readonly createdAt?: Date | undefined;
}

/**
 * Single item in user's recent execution history.
 */
export interface UserHistoryItemDTO {
  readonly id: string;
  readonly featureId: string;
  readonly featureName: string;
  readonly provider: string;
  readonly model?: string | undefined;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly latency: number;
  readonly estimatedCostUSD: number;
  readonly status: AIExecutionStatus;
  readonly createdAt: Date;
}

export interface UserFeatureUsageDTO {
  readonly featureId: string;
  readonly name: string;
  readonly category: string;
  readonly count: number;
  readonly percentage: number;
  readonly totalTokens: number;
}

export interface UserDailyActivityDTO {
  readonly date: string; // "YYYY-MM-DD"
  readonly count: number;
  readonly totalTokens: number;
}

/**
 * Aggregated summary for the authenticated user (GET /api/ai/usage/me).
 */
export interface UserUsageSummaryDTO {
  readonly totalGenerations: number;
  readonly totalTokens: number;
  readonly estimatedCost: number;
  readonly averageLatency: number;
  readonly mostUsedFeature: {
    readonly featureId: string;
    readonly name: string;
    readonly count: number;
  } | null;
  readonly featureUsage: readonly UserFeatureUsageDTO[];
  readonly dailyActivity: readonly UserDailyActivityDTO[];
  readonly recentHistory: readonly UserHistoryItemDTO[];
}

/**
 * Breakdown of a specific AI feature's usage in admin analytics.
 */
export interface TopFeatureAnalyticsDTO {
  readonly featureId: string;
  readonly name: string;
  readonly category: string;
  readonly count: number;
  readonly totalTokens: number;
  readonly totalCost: number;
}

/**
 * Breakdown of provider share in admin analytics.
 */
export interface ProviderDistributionDTO {
  readonly provider: string;
  readonly count: number;
  readonly percentage: number;
}

/**
 * Day-by-day generation volume and costs for time series charts.
 */
export interface DailyGenerationDTO {
  readonly date: string; // "YYYY-MM-DD"
  readonly count: number;
  readonly totalTokens: number;
  readonly totalCost: number;
}

/**
 * High-level system-wide KPI summary metrics.
 */
export interface AdminSummaryMetricsDTO {
  readonly totalGenerations: number;
  readonly successfulGenerations: number;
  readonly failedGenerations: number;
  readonly successRate: number; // Percentage, e.g. 98.5
  readonly totalTokens: number;
  readonly totalCostUSD: number;
}

/**
 * Response payload for administrative analytics (GET /api/ai/usage/admin).
 */
export interface AdminUsageAnalyticsDTO {
  readonly summary: AdminSummaryMetricsDTO;
  readonly topFeatures: readonly TopFeatureAnalyticsDTO[];
  readonly providerDistribution: readonly ProviderDistributionDTO[];
  readonly dailyGenerations: readonly DailyGenerationDTO[];
  readonly averageLatency: number; // in milliseconds
  readonly averageTokenUsage: number;
}

/**
 * Query filter for admin analytics endpoint.
 */
export interface UsageQueryFilterDTO {
  readonly days?: number | undefined;
  readonly featureId?: string | undefined;
  readonly provider?: string | undefined;
  readonly status?: AIExecutionStatus | undefined;
}
