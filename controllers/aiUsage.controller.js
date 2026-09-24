const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware, AdminMiddleware } = require("../middlewares/auth.middleware");
const { aiUsageService } = require("../ai");

// =============================================================================
//  AI USAGE ANALYTICS CONTROLLER
//  controllers/aiUsage.controller.js
//
//  Design Decisions:
//  - Exposes REST endpoints for user-level and system-wide AI usage analytics.
//  - Strictly routes, validates, and responds (Repository -> Service -> Controller).
//  - GET /api/ai/usage/me (User-scoped KPIs & recent execution history).
//  - GET /api/ai/usage/admin (System-wide aggregated metrics & charts data).
//  - Zero membership and zero billing logic.
// =============================================================================

class AIUsageController extends Controller {
  _rootPath = "/api/ai/usage";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * GET /api/ai/usage/me
   * Returns authenticated user's generation volume, token counts, costs, most used feature,
   * and recent execution history.
   */
  getMeUsage = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    if (!userId) {
      return res.status(401).json({ error: "User unauthorized." });
    }

    const usage = await aiUsageService.getMeUsage(userId.toString());

    res.json({
      status: "success",
      data: usage,
      totalGenerations: usage.totalGenerations,
      totalTokens: usage.totalTokens,
      estimatedCost: usage.estimatedCost,
      mostUsedFeature: usage.mostUsedFeature,
      recentHistory: usage.recentHistory,
    });
  });

  /**
   * GET /api/ai/usage/admin
   * Returns aggregated statistics for administrators:
   * - Top AI features
   * - Provider distribution
   * - Daily generations
   * - Average latency
   * - Average token usage
   */
  getAdminAnalytics = asyncHandler(async (req, res) => {
    if (req.userInfo && req.userInfo.role && req.userInfo.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin role required." });
    }

    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    const analytics = await aiUsageService.getAdminAnalytics(days);

    res.json({
      status: "success",
      data: analytics,
      summary: analytics.summary,
      topFeatures: analytics.topFeatures,
      providerDistribution: analytics.providerDistribution,
      dailyGenerations: analytics.dailyGenerations,
      averageLatency: analytics.averageLatency,
      averageTokenUsage: analytics.averageTokenUsage,
    });
  });

  /**
   * Registers router endpoints
   */
  initController = () => {
    this._router.get(`${this._rootPath}/me`, AuthMiddleware, this.getMeUsage);
    this._router.get(`${this._rootPath}/admin`, AdminMiddleware, this.getAdminAnalytics);

    // Alias routes without /api prefix
    this._router.get(`/ai/usage/me`, AuthMiddleware, this.getMeUsage);
    this._router.get(`/ai/usage/admin`, AdminMiddleware, this.getAdminAnalytics);
  };
}

module.exports = AIUsageController;
