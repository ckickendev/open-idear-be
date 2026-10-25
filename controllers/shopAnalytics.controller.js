// =============================================================================
//  OPENIDEAR SHOP — COMMERCE ANALYTICS CONTROLLER (SPRINT S6)
//  controllers/shopAnalytics.controller.js
// =============================================================================

const express = require("express");
const { Controller } = require("../core");
const { shopAnalyticsService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const { analyticsEventRateLimiter } = require("../middlewares/shopRateLimit.middleware");
const asyncHandler = require("../utils/asyncHandler");

class ShopAnalyticsController extends Controller {
  _rootPath = "/shop/analytics";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * Public: Ingest embed impression, click, or product detail view event.
   */
  recordEvent = asyncHandler(async (req, res) => {
    const clientIp =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    const result = await shopAnalyticsService.recordEvent(
      req.body,
      clientIp,
      userAgent
    );

    res.status(200).json({
      status: "success",
      data: result,
    });
  });

  /**
   * Admin: Unified Commerce Analytics Overview & Funnel Metrics.
   */
  getCommerceOverview = asyncHandler(async (req, res) => {
    const { range, startDate, endDate } = req.query;

    const result = await shopAnalyticsService.getCommerceAnalyticsOverview({
      range,
      startDate,
      endDate,
      isAuthorizedAdmin: true,
    });

    res.status(200).json({
      status: "success",
      data: result,
    });
  });

  initController = () => {
    // Public event ingestion (strictly rate limited)
    this._router.post(`${this._rootPath}/event`, analyticsEventRateLimiter, this.recordEvent);

    // Admin analytics dashboard (guarded by AdminMiddleware)
    this._router.get(
      `${this._rootPath}/overview`,
      AdminMiddleware,
      this.getCommerceOverview
    );
  };
}

module.exports = ShopAnalyticsController;
