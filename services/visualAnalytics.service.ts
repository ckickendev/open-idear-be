// =============================================================================
//  OPENIDEAR — VISUAL ASSISTANT ANALYTICS SERVICE (SPRINT 4)
//  services/visualAnalytics.service.ts
//
//  Tracks author visual decisions:
//  - visual_suggestion_created
//  - visual_search_started
//  - visual_search_selected
//  - visual_generation_started
//  - visual_generation_accepted
//  - visual_generation_rejected
//  - visual_generation_regenerated
//  - visual_suggestion_dismissed
//  (Also backward-compatible with: generated, accepted, regenerated, deleted, search_preferred)
//
//  Quality Metrics Engine:
//  - suggestion acceptance rate
//  - generation acceptance rate
//  - regeneration rate
//  - search vs generation preference
//  - dismissal rate
// =============================================================================

import mongoose from "mongoose";
const { VisualAnalytics } = require("../models");

export type VisualActionType =
  // Sprint 4 Canonical Telemetry Events
  | "visual_suggestion_created"
  | "visual_search_started"
  | "visual_search_selected"
  | "visual_generation_started"
  | "visual_generation_accepted"
  | "visual_generation_rejected"
  | "visual_generation_regenerated"
  | "visual_suggestion_dismissed"
  // Legacy Aliases
  | "generated"
  | "accepted"
  | "regenerated"
  | "deleted"
  | "search_preferred";

export interface RecordVisualEventDTO {
  userId?: string | mongoose.Types.ObjectId | null;
  postId?: string | mongoose.Types.ObjectId | null;
  heading?: string;
  visualType?: string;
  recommendation?: string;
  recommendedAction?: string;
  actionTaken: VisualActionType | string;
  preset?: string | null;
  prompt?: string | null;
  confidence?: number | null;
  metadata?: Record<string, any>;
}

export interface VisualQualityMetrics {
  totalSuggestionsCreated: number;
  totalSearchStarted: number;
  totalSearchSelected: number;
  totalGenerationStarted: number;
  totalGenerationAccepted: number;
  totalGenerationRejected: number;
  totalGenerationRegenerated: number;
  totalDismissed: number;
  // Rates in percentages (0.0 to 100.0)
  suggestionAcceptanceRate: number;
  generationAcceptanceRate: number;
  regenerationRate: number;
  searchVsGenerationPreference: number;
  dismissalRate: number;
}

export class VisualAnalyticsService {
  private _memoryLog: any[] = [];

  public static readonly VALID_ACTIONS: string[] = [
    "visual_suggestion_created",
    "visual_search_started",
    "visual_search_selected",
    "visual_generation_started",
    "visual_generation_accepted",
    "visual_generation_rejected",
    "visual_generation_regenerated",
    "visual_suggestion_dismissed",
    "generated",
    "accepted",
    "regenerated",
    "deleted",
    "search_preferred",
  ];

  /**
   * Persist a telemetry event. Safe: fails silently in production or returns in-memory mock if DB disconnected.
   */
  public async recordEvent(data: RecordVisualEventDTO): Promise<any> {
    const rawAction = data.actionTaken;

    if (!VisualAnalyticsService.VALID_ACTIONS.includes(rawAction)) {
      throw new Error(
        `Invalid actionTaken: "${rawAction}". Must be one of: ${VisualAnalyticsService.VALID_ACTIONS.join(", ")}`
      );
    }

    const fallbackRecord = {
      _id: new mongoose.Types.ObjectId(),
      userId: data.userId || null,
      postId: data.postId || null,
      heading: (data.heading || "").trim(),
      visualType: (data.visualType || "illustration").trim(),
      recommendedAction: (data.recommendedAction || data.recommendation || "generate").trim(),
      actionTaken: rawAction,
      preset: data.preset || null,
      prompt: data.prompt || null,
      confidence: typeof data.confidence === "number" ? data.confidence : null,
      metadata: data.metadata || {},
      createdAt: new Date(),
      simulated: true,
    };

    this._memoryLog.push(fallbackRecord);

    if (mongoose.connection.readyState !== 1) {
      return fallbackRecord;
    }

    try {
      const parsedUserId =
        data.userId && mongoose.Types.ObjectId.isValid(data.userId.toString())
          ? new mongoose.Types.ObjectId(data.userId.toString())
          : null;

      const parsedPostId =
        data.postId && mongoose.Types.ObjectId.isValid(data.postId.toString())
          ? new mongoose.Types.ObjectId(data.postId.toString())
          : null;

      const record = await VisualAnalytics.create({
        userId: parsedUserId,
        postId: parsedPostId,
        heading: (data.heading || "").trim(),
        visualType: (data.visualType || "illustration").trim(),
        recommendedAction: (data.recommendedAction || data.recommendation || "generate").trim(),
        actionTaken: rawAction,
        preset: data.preset || null,
        prompt: data.prompt || null,
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        metadata: data.metadata || {},
        createdAt: new Date(),
      });

      return record;
    } catch (err: any) {
      return fallbackRecord;
    }
  }

  /**
   * Computes the 5 Sprint 4 Quality Metrics:
   * 1. suggestion acceptance rate
   * 2. generation acceptance rate
   * 3. regeneration rate
   * 4. search vs generation preference
   * 5. dismissal rate
   */
  public async computeQualityMetrics(userId?: string | null): Promise<VisualQualityMetrics> {
    const matchFilter: any = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      matchFilter.userId = new mongoose.Types.ObjectId(userId);
    }

    let records: any[] = [];
    if (mongoose.connection.readyState === 1) {
      try {
        records = await VisualAnalytics.find(matchFilter).lean().limit(2000);
      } catch {
        records = this._memoryLog;
      }
    } else {
      records = this._memoryLog;
    }

    let created = 0;
    let searchStarted = 0;
    let searchSelected = 0;
    let genStarted = 0;
    let genAccepted = 0;
    let genRejected = 0;
    let genRegenerated = 0;
    let dismissed = 0;

    for (const r of records) {
      const act = r.actionTaken;
      if (act === "visual_suggestion_created") created++;
      else if (act === "visual_search_started") searchStarted++;
      else if (act === "visual_search_selected") searchSelected++;
      else if (act === "visual_generation_started" || act === "generated") genStarted++;
      else if (act === "visual_generation_accepted" || act === "accepted") genAccepted++;
      else if (act === "visual_generation_rejected" || act === "deleted") genRejected++;
      else if (act === "visual_generation_regenerated" || act === "regenerated") genRegenerated++;
      else if (act === "visual_suggestion_dismissed") dismissed++;
      else if (act === "search_preferred") searchStarted++;
    }

    const totalAcceptedVisuals = genAccepted + searchSelected;
    const effectiveCreated = Math.max(created, totalAcceptedVisuals + dismissed, 1);

    const suggestionAcceptanceRate =
      effectiveCreated > 0
        ? Number(((totalAcceptedVisuals / effectiveCreated) * 100).toFixed(1))
        : 0;

    const generationAcceptanceRate =
      genStarted > 0
        ? Number(((genAccepted / genStarted) * 100).toFixed(1))
        : 0;

    const regenerationRate =
      genStarted > 0
        ? Number(((genRegenerated / genStarted) * 100).toFixed(1))
        : 0;

    const totalVisualRequests = searchStarted + genStarted;
    const searchVsGenerationPreference =
      totalVisualRequests > 0
        ? Number(((searchStarted / totalVisualRequests) * 100).toFixed(1))
        : 0;

    const dismissalRate =
      effectiveCreated > 0
        ? Number(((dismissed / effectiveCreated) * 100).toFixed(1))
        : 0;

    return {
      totalSuggestionsCreated: created,
      totalSearchStarted: searchStarted,
      totalSearchSelected: searchSelected,
      totalGenerationStarted: genStarted,
      totalGenerationAccepted: genAccepted,
      totalGenerationRejected: genRejected,
      totalGenerationRegenerated: genRegenerated,
      totalDismissed: dismissed,
      suggestionAcceptanceRate,
      generationAcceptanceRate,
      regenerationRate,
      searchVsGenerationPreference,
      dismissalRate,
    };
  }

  /**
   * Aggregate metrics for user or repository-wide (backward-compatible stats + Sprint 4 metrics).
   */
  public async getStats(userId?: string | null): Promise<any> {
    const qualityMetrics = await this.computeQualityMetrics(userId);

    const actions: Record<string, number> = {
      generated: qualityMetrics.totalGenerationStarted,
      accepted: qualityMetrics.totalGenerationAccepted,
      regenerated: qualityMetrics.totalGenerationRegenerated,
      deleted: qualityMetrics.totalGenerationRejected,
      search_preferred: qualityMetrics.totalSearchStarted,
    };

    return {
      totalEvents:
        qualityMetrics.totalSuggestionsCreated +
        qualityMetrics.totalSearchStarted +
        qualityMetrics.totalSearchSelected +
        qualityMetrics.totalGenerationStarted +
        qualityMetrics.totalGenerationAccepted +
        qualityMetrics.totalGenerationRejected +
        qualityMetrics.totalGenerationRegenerated +
        qualityMetrics.totalDismissed,
      actions,
      acceptanceRate: qualityMetrics.suggestionAcceptanceRate,
      searchPreferenceRate: qualityMetrics.searchVsGenerationPreference,
      metrics: qualityMetrics,
    };
  }

  public clearMemoryLog(): void {
    this._memoryLog.length = 0;
  }
}

export const visualAnalyticsService = new VisualAnalyticsService();
