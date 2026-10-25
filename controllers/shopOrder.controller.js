// =============================================================================
//  OPENIDEAR SHOP — SHOP ORDER CONTROLLER (SPRINT S3)
//  controllers/shopOrder.controller.js
// =============================================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const { Controller } = require("../core");
const { shopOrderService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

// Public inquiry rate limiter: 15 inquiries per 15 minutes per IP
const inquiryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many purchase inquiries submitted from this IP. Please wait a few minutes before submitting again.",
  },
});

// Admin or external cron runner middleware (permits valid x-cron-secret or AdminMiddleware)
const AdminOrCronMiddleware = async (req, res, next) => {
  const cronSecret = process.env.SHOP_CRON_SECRET;
  const providedSecret = req.headers["x-cron-secret"];
  if (cronSecret && providedSecret && cronSecret === providedSecret) {
    req.userInfo = { role: "admin", email: "system-cron@openidear.local" };
    return next();
  }
  return AdminMiddleware(req, res, next);
};

class ShopOrderController extends Controller {
  _rootPath = "/shop/orders";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * Public: Submit purchase inquiry.
   */
  createInquiry = asyncHandler(async (req, res) => {
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
    const result = await shopOrderService.createInquiry(req.body, clientIp);
    const statusCode = result.isIdempotentRetry ? 200 : 201;
    res.status(statusCode).json({
      status: "success",
      message: result.isIdempotentRetry
        ? "Existing purchase inquiry reference returned"
        : "Purchase inquiry received successfully",
      data: result,
    });
  });

  /**
   * Admin: List orders with filters and pagination.
   */
  getOrdersAdmin = asyncHandler(async (req, res) => {
    const result = await shopOrderService.getOrdersAdmin(req.query);
    res.json({
      status: "success",
      data: result.orders,
      pagination: result.pagination,
    });
  });

  /**
   * Admin: Get order details by ID.
   */
  getOrderByIdAdmin = asyncHandler(async (req, res) => {
    const order = await shopOrderService.getOrderByIdAdmin(req.params.id);
    res.json({
      status: "success",
      data: order,
    });
  });

  /**
   * Admin: Update order lifecycle status.
   */
  updateOrderStatus = asyncHandler(async (req, res) => {
    const adminUserId = req.userInfo?._id || req.user?._id || null;
    const { status, note } = req.body;
    const order = await shopOrderService.updateOrderStatus(
      req.params.id,
      status,
      adminUserId,
      note
    );
    res.json({
      status: "success",
      message: `Order status updated to '${order.status}'`,
      data: order,
    });
  });

  /**
   * Admin: Update internal admin notes.
   */
  updateAdminNote = asyncHandler(async (req, res) => {
    const { adminNote } = req.body;
    const order = await shopOrderService.updateAdminNote(
      req.params.id,
      adminNote
    );
    res.json({
      status: "success",
      message: "Admin note updated successfully",
      data: order,
    });
  });

  /**
   * Admin: Verify supplier item availability, cost price, and confirmed lead time.
   */
  verifySupplierItem = asyncHandler(async (req, res) => {
    const adminUserId = req.userInfo?._id || req.user?._id || null;
    const order = await shopOrderService.verifySupplierItem(
      req.params.id,
      req.params.itemId,
      req.body,
      adminUserId
    );
    res.json({
      status: "success",
      message: "Supplier verification recorded successfully",
      data: order,
    });
  });

  /**
   * Admin / Cron: Release expired inventory reservations.
   */
  releaseExpiredReservations = asyncHandler(async (req, res) => {
    const result = await shopOrderService.releaseExpiredReservations();
    res.json({
      status: "success",
      message: `Released ${result.count} expired inventory reservations`,
      data: result,
    });
  });

  initController = () => {
    // ─── Public Routes ────────────────────────────────────────────────────────
    this._router.post(
      `${this._rootPath}/inquiries`,
      inquiryRateLimiter,
      this.createInquiry
    );

    // ─── Admin Routes (guarded by AdminMiddleware) ────────────────────────────
    this._router.get(
      `${this._rootPath}/admin`,
      AdminMiddleware,
      this.getOrdersAdmin
    );
    this._router.post(
      `${this._rootPath}/admin/release-expired`,
      AdminOrCronMiddleware,
      this.releaseExpiredReservations
    );
    this._router.get(
      `${this._rootPath}/admin/:id`,
      AdminMiddleware,
      this.getOrderByIdAdmin
    );
    this._router.patch(
      `${this._rootPath}/admin/:id/status`,
      AdminMiddleware,
      this.updateOrderStatus
    );
    this._router.patch(
      `${this._rootPath}/admin/:id/notes`,
      AdminMiddleware,
      this.updateAdminNote
    );
    this._router.patch(
      `${this._rootPath}/admin/:id/items/:itemId/verify-supplier`,
      AdminMiddleware,
      this.verifySupplierItem
    );
  };
}

module.exports = ShopOrderController;
