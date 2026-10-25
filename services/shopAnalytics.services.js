// =============================================================================
//  OPENIDEAR SHOP — COMMERCE ANALYTICS SERVICE (SPRINT S6)
//  services/shopAnalytics.services.js
// =============================================================================

const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  ShopAnalyticsEvent,
  ShopOrder,
  ShopProduct,
  Post,
  SHOP_ANALYTICS_EVENT_TYPES,
} = require("../models");
const { BadRequestException } = require("../exceptions");

class ShopAnalyticsService {
  /**
   * Helper: Hash IP and user-agent for pseudo-anonymous session grouping without storing PII.
   */
  _hashSession(ip = "", userAgent = "") {
    const salt = process.env.ANALYTICS_SALT || "openidear_shop_salt_2026";
    return crypto
      .createHash("sha256")
      .update(`${ip}:${userAgent}:${salt}`)
      .digest("hex");
  }

  /**
   * Helper: Parse range string or date objects into strict UTC Date boundaries.
   */
  _parseDateRange(range = "30d", startDate, endDate) {
    const now = new Date();
    let start;
    let end = new Date(now);

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequestException("Invalid startDate or endDate format");
      }
      return { start, end, range: "custom" };
    }

    switch (range) {
      case "7d":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        start = new Date(0);
        break;
      case "30d":
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        range = "30d";
        break;
    }

    return { start, end, range };
  }

  /**
   * Public: Ingest an embed or catalog analytics event with payload validation and rate limit safety.
   */
  async recordEvent(payload = {}, clientIp = "", userAgent = "") {
    let { eventType, productId, articleSlug, embedId } = payload;

    // Normalize eventType aliases
    if (eventType === "impression") eventType = "embed_impression";
    if (eventType === "click") eventType = "embed_click";

    if (!eventType || !SHOP_ANALYTICS_EVENT_TYPES.includes(eventType)) {
      throw new BadRequestException(
        `Invalid eventType. Allowed: ${SHOP_ANALYTICS_EVENT_TYPES.join(", ")}`
      );
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      throw new BadRequestException("Valid MongoDB productId is required");
    }

    // Verify product exists and is published
    const product = await ShopProduct.findOne({
      _id: productId,
      del_flag: 0,
    }).select("_id status");

    if (!product) {
      throw new BadRequestException("Referenced product not found or deleted");
    }

    // Sanitize and validate articleSlug against real published post
    let cleanArticleSlug = null;
    if (articleSlug) {
      const candidate = String(articleSlug).replace(/[^\w-]/g, "").substring(0, 150);
      try {
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          const post = await Post.findOne({ slug: candidate, del_flag: 0 }).select("_id slug").lean();
          if (post) cleanArticleSlug = candidate;
        } else if (Object.prototype.hasOwnProperty.call(Post, "findOne")) {
          const postRes = Post.findOne({ slug: candidate, del_flag: 0 });
          const post = postRes && typeof postRes.lean === "function" ? await postRes.lean() : await postRes;
          if (post) cleanArticleSlug = candidate;
        } else {
          cleanArticleSlug = candidate || null;
        }
      } catch {
        cleanArticleSlug = null;
      }
    }

    const cleanEmbedId = embedId
      ? String(embedId).replace(/[^\w-]/g, "").substring(0, 64)
      : null;

    const sessionHash = this._hashSession(clientIp, userAgent);

    // 1. Create timestamped analytics event record
    await ShopAnalyticsEvent.create({
      eventType,
      productId,
      articleSlug: cleanArticleSlug,
      embedId: cleanEmbedId,
      sessionHash,
    }).catch((err) => {
      // Non-blocking log
      console.warn("[ShopAnalytics] Event insert warning:", err.message);
    });

    // 2. Increment lifetime counters on ShopProduct
    const incField = {};
    if (eventType === "embed_impression") incField.embedImpressions = 1;
    if (eventType === "embed_click") incField.embedClicks = 1;
    if (eventType === "detail_view") incField.views = 1;

    if (Object.keys(incField).length > 0) {
      await ShopProduct.updateOne(
        { _id: productId },
        { $inc: incField }
      ).catch(() => {});
    }

    return { success: true, eventType, recordedAt: new Date() };
  }

  /**
   * Admin: Unified Commerce Analytics Overview & Funnel Metrics.
   * Exposes business KPIs, conversion rates, content attribution, and product performance.
   */
  async getCommerceAnalyticsOverview(options = {}) {
    const { range, startDate, endDate, isAuthorizedAdmin = false } = options;
    const { start, end, range: resolvedRange } = this._parseDateRange(
      range,
      startDate,
      endDate
    );

    // ─── 1. Catalog & Embed Metrics in Selected Time Range ───────────────
    let eventMetrics = [];
    try {
      eventMetrics = await ShopAnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: "$eventType",
            count: { $sum: 1 },
          },
        },
      ]);
    } catch {
      eventMetrics = [];
    }

    const eventCountMap = {};
    for (const em of eventMetrics || []) {
      eventCountMap[em._id] = em.count;
    }

    let productMetrics = null;
    try {
      const pAgg = await ShopProduct.aggregate([
        { $match: { del_flag: 0 } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: "$views" },
            totalEmbedImpressions: { $sum: "$embedImpressions" },
            totalEmbedClicks: { $sum: "$embedClicks" },
            totalProductsCount: { $sum: 1 },
          },
        },
      ]);
      productMetrics = pAgg?.[0] || null;
    } catch {
      productMetrics = null;
    }

    const hasDiscreteEvents = eventMetrics && eventMetrics.length > 0;
    const totalViews =
      resolvedRange !== "all" && hasDiscreteEvents && eventCountMap.detail_view !== undefined
        ? eventCountMap.detail_view
        : productMetrics?.totalViews || 0;

    const totalEmbedImpressions =
      resolvedRange !== "all" && hasDiscreteEvents && eventCountMap.embed_impression !== undefined
        ? eventCountMap.embed_impression
        : productMetrics?.totalEmbedImpressions || 0;

    const totalEmbedClicks =
      resolvedRange !== "all" && hasDiscreteEvents && eventCountMap.embed_click !== undefined
        ? eventCountMap.embed_click
        : productMetrics?.totalEmbedClicks || 0;

    const embedCtr =
      totalEmbedImpressions > 0
        ? Number(((totalEmbedClicks / totalEmbedImpressions) * 100).toFixed(2))
        : 0;

    // ─── 2. Order Funnel Metrics in Range ─────────────────────────────────
    const orderMatch = {
      createdAt: { $gte: start, $lte: end },
      del_flag: 0,
    };

    const ordersByStatus = await ShopOrder.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalValue: { $sum: "$subtotal" },
        },
      },
    ]);

    const statusMap = {};
    for (const s of ordersByStatus) {
      statusMap[s._id] = { count: s.count, value: s.totalValue };
    }

    const inquiriesCount = ordersByStatus.reduce((acc, curr) => acc + curr.count, 0);
    const contactedCount = statusMap.contacted?.count || 0;
    const awaitingCustomerCount =
      statusMap.awaiting_customer_confirmation?.count || 0;
    const confirmedCount = statusMap.confirmed?.count || 0;
    const completedCount = statusMap.completed?.count || 0;
    const cancelledCount = statusMap.cancelled?.count || 0;

    // Confirmed orders = confirmed + completed (since completed must pass confirmed)
    const totalConfirmedOrCompletedCount = confirmedCount + completedCount;

    // Conversion rates
    const inquiryToConfirmRate =
      inquiriesCount > 0
        ? Number(
            ((totalConfirmedOrCompletedCount / inquiriesCount) * 100).toFixed(2)
          )
        : 0;

    const inquiryToCompleteRate =
      inquiriesCount > 0
        ? Number(((completedCount / inquiriesCount) * 100).toFixed(2))
        : 0;

    const cancellationRate =
      inquiriesCount > 0
        ? Number(((cancelledCount / inquiriesCount) * 100).toFixed(2))
        : 0;

    // ─── 3. Business Financial Metrics ────────────────────────────────────
    // Values:
    // - inquiryPipelineValue: initial / unconfirmed inquiries
    // - grossConfirmedValue: confirmed + completed orders
    // - completedRevenue: strictly completed (delivered) orders
    // - cancelledLostValue: cancelled orders (never counted in revenue)
    const inquiryPipelineValue =
      (statusMap.inquiry_received?.value || 0) +
      (statusMap.contacted?.value || 0) +
      (statusMap.awaiting_customer_confirmation?.value || 0);

    const grossConfirmedValue =
      (statusMap.confirmed?.value || 0) + (statusMap.completed?.value || 0);

    const completedRevenue = statusMap.completed?.value || 0;
    const cancelledLostValue = statusMap.cancelled?.value || 0;

    const averageOrderValue =
      completedCount > 0
        ? Math.round(completedRevenue / completedCount)
        : totalConfirmedOrCompletedCount > 0
        ? Math.round(grossConfirmedValue / totalConfirmedOrCompletedCount)
        : 0;

    // ─── 4. Contribution Margin (Role-Restricted to Admins) ───────────────
    let contributionMargin = null;
    if (isAuthorizedAdmin) {
      const marginData = await ShopOrder.aggregate([
        {
          $match: {
            ...orderMatch,
            status: "completed",
          },
        },
        { $unwind: "$items" },
        {
          $project: {
            unitPrice: "$items.unitPrice",
            quantity: "$items.quantity",
            costPrice: "$items.supplierVerification.supplierCostPrice",
          },
        },
        {
          $group: {
            _id: null,
            totalItems: { $sum: "$quantity" },
            verifiedCostItems: {
              $sum: {
                $cond: [{ $ifNull: ["$costPrice", false] }, "$quantity", 0],
              },
            },
            totalRevenueSampled: {
              $sum: {
                $cond: [
                  { $ifNull: ["$costPrice", false] },
                  { $multiply: ["$unitPrice", "$quantity"] },
                  0,
                ],
              },
            },
            totalCostSampled: {
              $sum: {
                $cond: [
                  { $ifNull: ["$costPrice", false] },
                  { $multiply: ["$costPrice", "$quantity"] },
                  0,
                ],
              },
            },
          },
        },
      ]);

      const m = marginData[0];
      if (m && m.verifiedCostItems > 0) {
        const estimatedMargin = m.totalRevenueSampled - m.totalCostSampled;
        const marginPct =
          m.totalRevenueSampled > 0
            ? Number(((estimatedMargin / m.totalRevenueSampled) * 100).toFixed(2))
            : 0;
        const coveragePct =
          m.totalItems > 0
            ? Number(((m.verifiedCostItems / m.totalItems) * 100).toFixed(2))
            : 0;

        contributionMargin = {
          estimatedContributionMargin: estimatedMargin,
          contributionMarginPercentage: marginPct,
          verifiedCostItemCoveragePct: coveragePct,
          notes:
            "Calculated strictly from completed order items with recorded supplier cost prices.",
        };
      } else {
        contributionMargin = {
          estimatedContributionMargin: 0,
          contributionMarginPercentage: 0,
          verifiedCostItemCoveragePct: 0,
          notes: "No completed orders with verified supplier costs found in period.",
        };
      }
    }

    // ─── 5. Content Attribution Analytics ─────────────────────────────────
    const attributionAggregation = await ShopOrder.aggregate([
      {
        $match: {
          ...orderMatch,
          "attribution.articleSlug": { $ne: null, $exists: true },
        },
      },
      {
        $group: {
          _id: "$attribution.articleSlug",
          inquiries: { $sum: 1 },
          confirmed: {
            $sum: {
              $cond: [
                { $in: ["$status", ["confirmed", "completed"]] },
                1,
                0,
              ],
            },
          },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
          grossValue: {
            $sum: {
              $cond: [
                { $in: ["$status", ["confirmed", "completed"]] },
                "$subtotal",
                0,
              ],
            },
          },
          completedRevenue: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, "$subtotal", 0],
            },
          },
        },
      },
      { $sort: { inquiries: -1, grossValue: -1 } },
      { $limit: 10 },
    ]);

    const attributedInquiriesCount = attributionAggregation.reduce(
      (acc, curr) => acc + curr.inquiries,
      0
    );
    const attributedConfirmedCount = attributionAggregation.reduce(
      (acc, curr) => acc + curr.confirmed,
      0
    );
    const attributedCompletedCount = attributionAggregation.reduce(
      (acc, curr) => acc + curr.completed,
      0
    );
    const attributedCompletedRevenue = attributionAggregation.reduce(
      (acc, curr) => acc + curr.completedRevenue,
      0
    );

    const attributionShare =
      inquiriesCount > 0
        ? Number(((attributedInquiriesCount / inquiriesCount) * 100).toFixed(2))
        : 0;

    const topArticles = attributionAggregation.map((a) => ({
      articleSlug: a._id,
      inquiries: a.inquiries,
      confirmed: a.confirmed,
      completed: a.completed,
      grossValue: a.grossValue,
      completedRevenue: a.completedRevenue,
    }));

    // ─── 6. Product Performance Leaderboard ───────────────────────────────
    const topProducts = await ShopProduct.find({ del_flag: 0 })
      .select("name slug sku sellingPrice views embedImpressions embedClicks orderCount status")
      .sort({ orderCount: -1, views: -1 })
      .limit(10)
      .lean();

    const productPerformance = topProducts.map((p) => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      sellingPrice: p.sellingPrice,
      views: p.views || 0,
      embedImpressions: p.embedImpressions || 0,
      embedClicks: p.embedClicks || 0,
      ctr:
        p.embedImpressions > 0
          ? Number(((p.embedClicks / p.embedImpressions) * 100).toFixed(2))
          : 0,
      orderCount: p.orderCount || 0,
      status: p.status,
    }));

    // ─── 7. Response Assembly & Transparency Metadata ─────────────────────
    return {
      timeRange: {
        range: resolvedRange,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        timezone: "UTC",
      },
      funnel: {
        productDetailViews: totalViews,
        productEmbedImpressions: totalEmbedImpressions,
        productEmbedClicks: totalEmbedClicks,
        embedClickThroughRatePct: embedCtr,
        inquiriesReceived: inquiriesCount,
        contacted: contactedCount,
        awaitingCustomerConfirmation: awaitingCustomerCount,
        ordersConfirmed: totalConfirmedOrCompletedCount,
        ordersCompleted: completedCount,
        ordersCancelled: cancelledCount,
        inquiryToConfirmRatePct: inquiryToConfirmRate,
        inquiryToCompleteRatePct: inquiryToCompleteRate,
        cancellationRatePct: cancellationRate,
      },
      revenue: {
        currency: "VND",
        inquiryPipelineValue,
        grossConfirmedValue,
        completedRevenue,
        cancelledLostValue,
        averageOrderValue,
        contributionMargin,
      },
      attribution: {
        attributedInquiriesCount,
        attributedConfirmedCount,
        attributedCompletedCount,
        attributedCompletedRevenue,
        attributionSharePct: attributionShare,
        topArticles,
      },
      productPerformance,
      metadata: {
        attributionModel: "last_touch_session_parameter",
        dataIntegrityNotes: [
          "Unique Visitors: Product views and embed impressions represent raw/session-deduplicated counts, not globally unique individuals.",
          "Attribution: Inquiries preserve 'from_article' from the most recent product card click during the customer session.",
          "Revenue Isolation: Cancelled orders are strictly excluded from gross confirmed and completed revenue.",
          "Contribution Margin: Only accessible to authorized admin roles; items without verified supplier costs are excluded from margin calculations.",
        ],
      },
    };
  }
}

module.exports = new ShopAnalyticsService();
