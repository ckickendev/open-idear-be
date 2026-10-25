// =============================================================================
//  AI USAGE SERVICE
//  ai/usage/service/aiUsage.service.ts
//
//  Design Decisions:
//  - Implements domain business logic and response transformation for AI usage.
//  - Enriches raw repository aggregation results with human-readable feature metadata
//    from centralized `aiFeatureRegistry`.
//  - Strict separation of concerns (Repository -> Service -> Controller).
//  - Zero membership and zero billing dependencies.
// =============================================================================

import { aiFeatureRegistry } from "../../feature";
import { aiUsageRepository, AIUsageRepository } from "../repository/aiUsage.repository";
import type {
  CreateAIUsageDTO,
  UserUsageSummaryDTO,
  AdminUsageAnalyticsDTO,
  TopFeatureAnalyticsDTO,
  ProviderDistributionDTO,
  UserHistoryItemDTO,
  UserFeatureUsageDTO,
  UserDailyActivityDTO,
} from "../dto/aiUsage.dto";

export class AIUsageService {
  constructor(private readonly repository: AIUsageRepository = aiUsageRepository) {}

  /**
   * Records an execution event into the analytics store.
   */
  async recordUsage(dto: CreateAIUsageDTO) {
    return await this.repository.create(dto);
  }

  /**
   * Retrieves usage summary and recent history for the authenticated user.
   */
  async getMeUsage(userId: string): Promise<UserUsageSummaryDTO> {
    const [summaryResult, rawHistory] = await Promise.all([
      this.repository.getUserSummary(userId),
      this.repository.getUserHistory(userId, 20),
    ]);

    // Enrich most used feature with human-readable name
    let mostUsedFeatureWithMeta: UserUsageSummaryDTO["mostUsedFeature"] = null;
    if (summaryResult.mostUsedFeature) {
      const feature = aiFeatureRegistry.find(summaryResult.mostUsedFeature.featureId);
      mostUsedFeatureWithMeta = {
        featureId: summaryResult.mostUsedFeature.featureId,
        name: feature?.name || summaryResult.mostUsedFeature.featureId,
        count: summaryResult.mostUsedFeature.count,
      };
    }

    // Format feature usage progress bars breakdown
    const totalGenerations = summaryResult.totalGenerations || 0;
    const rawFeatures = summaryResult.featureBreakdown || [];
    const featureUsage: UserFeatureUsageDTO[] = rawFeatures.map((f) => {
      const feature = aiFeatureRegistry.find(f.featureId);
      const percentage =
        totalGenerations > 0
          ? Number(((f.count / totalGenerations) * 100).toFixed(1))
          : 0;
      return {
        featureId: f.featureId,
        name: feature?.name || f.featureId,
        category: feature?.category || "general",
        count: f.count,
        percentage,
        totalTokens: f.totalTokens || 0,
      };
    });

    // Normalize consecutive 7-day daily activity timeline
    const dailyMap = new Map<string, { count: number; totalTokens: number }>();
    (summaryResult.dailyGenerations || []).forEach((d) => {
      dailyMap.set(d.date, { count: d.count, totalTokens: d.totalTokens });
    });

    const dailyActivity: UserDailyActivityDTO[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      const entry = dailyMap.get(dateStr) || { count: 0, totalTokens: 0 };
      dailyActivity.push({
        date: dateStr,
        count: entry.count,
        totalTokens: entry.totalTokens,
      });
    }

    // Format recent history items
    const recentHistory: UserHistoryItemDTO[] = rawHistory.map((item) => {
      const feature = aiFeatureRegistry.find(item.featureId);
      return {
        id: item._id.toString(),
        featureId: item.featureId,
        featureName: feature?.name || item.featureId,
        provider: item.provider,
        model: item.model,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        totalTokens: item.totalTokens,
        latency: item.latency,
        estimatedCostUSD: item.estimatedCostUSD,
        status: item.status,
        createdAt: item.createdAt,
      };
    });

    return {
      totalGenerations: summaryResult.totalGenerations,
      totalTokens: summaryResult.totalTokens,
      estimatedCost: summaryResult.estimatedCost,
      averageLatency: summaryResult.averageLatency || 0,
      mostUsedFeature: mostUsedFeatureWithMeta,
      featureUsage,
      dailyActivity,
      recentHistory,
    };
  }

  /**
   * Generates comprehensive system-wide analytics for administrators.
   */
  async getAdminAnalytics(days: number = 30): Promise<AdminUsageAnalyticsDTO> {
    const rawData = await this.repository.getAdminAnalytics(days);

    // 1. Enrich top features with registry metadata (Name, Category)
    const enrichedTopFeatures: TopFeatureAnalyticsDTO[] = rawData.topFeatures.map((f) => {
      const feature = aiFeatureRegistry.find(f.featureId);
      return {
        featureId: f.featureId,
        name: feature?.name || f.featureId,
        category: feature?.category || "general",
        count: f.count,
        totalTokens: f.totalTokens,
        totalCost: f.totalCost,
      };
    });

    // 2. Calculate provider percentage shares
    const totalProviderRequests = rawData.providerDistribution.reduce(
      (acc, curr) => acc + curr.count,
      0
    );

    const providerDistribution: ProviderDistributionDTO[] = rawData.providerDistribution.map((p) => ({
      provider: p.provider,
      count: p.count,
      percentage:
        totalProviderRequests > 0
          ? Number(((p.count / totalProviderRequests) * 100).toFixed(1))
          : 0,
    }));

    return {
      summary: rawData.summary,
      topFeatures: enrichedTopFeatures,
      providerDistribution,
      dailyGenerations: rawData.dailyGenerations,
      averageLatency: rawData.averageLatency,
      averageTokenUsage: rawData.averageTokenUsage,
    };
  }
}

export const aiUsageService = new AIUsageService();
