// =============================================================================
//  AI USAGE REPOSITORY
//  ai/usage/repository/aiUsage.repository.ts
//
//  Design Decisions:
//  - Encapsulates all raw Mongoose queries and Aggregation Pipelines.
//  - Leverages MongoDB $facet aggregations to compute multi-metric reports in
//    a single round-trip database operation.
//  - Safe ObjectId casting preventing invalid string query exceptions.
// =============================================================================

import { Types } from "mongoose";
import { AIUsage, type IAIUsage } from "../../../models/aiUsage.schema";
import type {
  CreateAIUsageDTO,
  TopFeatureAnalyticsDTO,
  ProviderDistributionDTO,
  DailyGenerationDTO,
  AdminSummaryMetricsDTO,
} from "../dto/aiUsage.dto";

export interface RawUserAggregationResult {
  readonly totalGenerations: number;
  readonly totalTokens: number;
  readonly estimatedCost: number;
  readonly averageLatency: number;
  readonly mostUsedFeature: {
    readonly featureId: string;
    readonly count: number;
  } | null;
  readonly featureBreakdown: Array<{
    readonly featureId: string;
    readonly count: number;
    readonly totalTokens: number;
  }>;
  readonly dailyGenerations: Array<{
    readonly date: string;
    readonly count: number;
    readonly totalTokens: number;
  }>;
}

export interface RawAdminAggregationResult {
  readonly summary: AdminSummaryMetricsDTO;
  readonly topFeatures: Array<{
    readonly featureId: string;
    readonly count: number;
    readonly totalTokens: number;
    readonly totalCost: number;
  }>;
  readonly providerDistribution: Array<{
    readonly provider: string;
    readonly count: number;
  }>;
  readonly dailyGenerations: Array<{
    readonly date: string;
    readonly count: number;
    readonly totalTokens: number;
    readonly totalCost: number;
  }>;
  readonly averageLatency: number;
  readonly averageTokenUsage: number;
}

export class AIUsageRepository {
  /**
   * Persists a new AI execution event in MongoDB.
   */
  async create(dto: CreateAIUsageDTO): Promise<IAIUsage> {
    let validUserId: Types.ObjectId | null = null;
    if (dto.userId && Types.ObjectId.isValid(dto.userId)) {
      validUserId = new Types.ObjectId(dto.userId);
    }

    const inputTokens = dto.inputTokens || 0;
    const outputTokens = dto.outputTokens || 0;
    const totalTokens = dto.totalTokens !== undefined ? dto.totalTokens : inputTokens + outputTokens;

    return await AIUsage.create({
      userId: validUserId,
      featureId: dto.featureId,
      provider: dto.provider || "default",
      promptVersion: dto.promptVersion || "v1",
      inputTokens,
      outputTokens,
      totalTokens,
      latency: Math.max(0, Math.round(dto.latency)),
      estimatedCostUSD: Math.max(0, Number((dto.estimatedCostUSD || 0).toFixed(6))),
      status: dto.status,
      errorMessage: dto.errorMessage,
      model: dto.model,
      ...(dto.createdAt && { createdAt: dto.createdAt }),
    });
  }

  /**
   * Computes high-level usage totals and most used feature for a specific user.
   */
  async getUserSummary(userId: string): Promise<RawUserAggregationResult> {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return {
        totalGenerations: 0,
        totalTokens: 0,
        estimatedCost: 0,
        averageLatency: 0,
        mostUsedFeature: null,
        featureBreakdown: [],
        dailyGenerations: [],
      };
    }

    const userObjectId = new Types.ObjectId(userId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [facetResult] = await AIUsage.aggregate([
      { $match: { userId: userObjectId } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalGenerations: { $sum: 1 },
                totalTokens: { $sum: "$totalTokens" },
                estimatedCost: { $sum: "$estimatedCostUSD" },
                avgLatency: { $avg: "$latency" },
              },
            },
          ],
          mostUsed: [
            {
              $group: {
                _id: "$featureId",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 1 },
          ],
          featureBreakdown: [
            {
              $group: {
                _id: "$featureId",
                count: { $sum: 1 },
                totalTokens: { $sum: "$totalTokens" },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          dailyGenerations: [
            {
              $match: {
                createdAt: { $gte: sevenDaysAgo },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
                totalTokens: { $sum: "$totalTokens" },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const totals = facetResult?.totals?.[0];
    const mostUsed = facetResult?.mostUsed?.[0];

    const featureBreakdown = (facetResult?.featureBreakdown || []).map((f: any) => ({
      featureId: f._id,
      count: f.count,
      totalTokens: f.totalTokens || 0,
    }));

    const dailyGenerations = (facetResult?.dailyGenerations || []).map((d: any) => ({
      date: d._id,
      count: d.count,
      totalTokens: d.totalTokens || 0,
    }));

    return {
      totalGenerations: totals?.totalGenerations || 0,
      totalTokens: totals?.totalTokens || 0,
      estimatedCost: Number((totals?.estimatedCost || 0).toFixed(6)),
      averageLatency: totals?.avgLatency ? Math.round(totals.avgLatency) : 0,
      mostUsedFeature: mostUsed
        ? {
            featureId: mostUsed._id,
            count: mostUsed.count,
          }
        : null,
      featureBreakdown,
      dailyGenerations,
    };
  }

  /**
   * Retrieves recent execution history for a user.
   */
  async getUserHistory(userId: string, limit: number = 10): Promise<IAIUsage[]> {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return [];
    }

    return await AIUsage.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean();
  }

  /**
   * Aggregation pipeline generating comprehensive administrative analytics.
   *
   * @param days Window of days to analyze (default: 30)
   */
  async getAdminAnalytics(days: number = 30): Promise<RawAdminAggregationResult> {
    const safeDays = Math.max(1, Math.min(365, days));
    const startDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [facetResult] = await AIUsage.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalGenerations: { $sum: 1 },
                successfulGenerations: {
                  $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] },
                },
                failedGenerations: {
                  $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] },
                },
                totalTokens: { $sum: "$totalTokens" },
                totalCostUSD: { $sum: "$estimatedCostUSD" },
                avgLatency: { $avg: "$latency" },
                avgTokens: { $avg: "$totalTokens" },
              },
            },
          ],
          topFeatures: [
            {
              $group: {
                _id: "$featureId",
                count: { $sum: 1 },
                totalTokens: { $sum: "$totalTokens" },
                totalCost: { $sum: "$estimatedCostUSD" },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          providerDistribution: [
            {
              $group: {
                _id: "$provider",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
          dailyGenerations: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
                totalTokens: { $sum: "$totalTokens" },
                totalCost: { $sum: "$estimatedCostUSD" },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const rawSummary = facetResult?.summary?.[0];
    const totalGenerations = rawSummary?.totalGenerations || 0;
    const successfulGenerations = rawSummary?.successfulGenerations || 0;
    const failedGenerations = rawSummary?.failedGenerations || 0;
    const successRate =
      totalGenerations > 0
        ? Number(((successfulGenerations / totalGenerations) * 100).toFixed(2))
        : 100;

    const summary: AdminSummaryMetricsDTO = {
      totalGenerations,
      successfulGenerations,
      failedGenerations,
      successRate,
      totalTokens: rawSummary?.totalTokens || 0,
      totalCostUSD: Number((rawSummary?.totalCostUSD || 0).toFixed(6)),
    };

    const topFeatures = (facetResult?.topFeatures || []).map((f: any) => ({
      featureId: f._id,
      count: f.count,
      totalTokens: f.totalTokens || 0,
      totalCost: Number((f.totalCost || 0).toFixed(6)),
    }));

    const providerDistribution = (facetResult?.providerDistribution || []).map((p: any) => ({
      provider: p._id,
      count: p.count,
    }));

    const dailyGenerations = (facetResult?.dailyGenerations || []).map((d: any) => ({
      date: d._id,
      count: d.count,
      totalTokens: d.totalTokens || 0,
      totalCost: Number((d.totalCost || 0).toFixed(6)),
    }));

    const averageLatency = rawSummary?.avgLatency
      ? Math.round(rawSummary.avgLatency)
      : 0;

    const averageTokenUsage = rawSummary?.avgTokens
      ? Math.round(rawSummary.avgTokens)
      : 0;

    return {
      summary,
      topFeatures,
      providerDistribution,
      dailyGenerations,
      averageLatency,
      averageTokenUsage,
    };
  }
}

export const aiUsageRepository = new AIUsageRepository();
