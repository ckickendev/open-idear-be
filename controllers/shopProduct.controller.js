const express = require("express");
const rateLimit = require("express-rate-limit");
const { Controller } = require("../core");
const { shopProductService, shopAnalyticsService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const { analyticsEventRateLimiter } = require("../middlewares/shopRateLimit.middleware");
const asyncHandler = require("../utils/asyncHandler");

class ShopProductController extends Controller {
  _rootPath = "/shop/products";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  createProduct = asyncHandler(async (req, res) => {
    const product = await shopProductService.createProduct(req.body);
    res.status(201).json({
      status: "success",
      message: "Product created successfully",
      data: product,
    });
  });

  getProductsAdmin = asyncHandler(async (req, res) => {
    const result = await shopProductService.getProductsAdmin(req.query);
    res.json({
      status: "success",
      data: result.products,
      pagination: result.pagination,
    });
  });

  getProductByIdAdmin = asyncHandler(async (req, res) => {
    const product = await shopProductService.getProductByIdAdmin(req.params.id);
    res.json({
      status: "success",
      data: product,
    });
  });

  updateProduct = asyncHandler(async (req, res) => {
    const product = await shopProductService.updateProduct(
      req.params.id,
      req.body
    );
    res.json({
      status: "success",
      message: "Product updated successfully",
      data: product,
    });
  });

  updateStock = asyncHandler(async (req, res) => {
    const result = await shopProductService.updateStock(
      req.params.id,
      req.body.stockQuantity
    );
    res.json({
      status: "success",
      message: "Stock quantity updated successfully",
      data: result,
    });
  });

  deleteProduct = asyncHandler(async (req, res) => {
    const result = await shopProductService.deleteProduct(req.params.id);
    res.json({
      status: "success",
      message: result.message,
    });
  });

  getPublishedProductsPublic = asyncHandler(async (req, res) => {
    const result = await shopProductService.getPublishedProductsPublic(req.query);
    res.json({
      status: "success",
      data: result.products,
      pagination: result.pagination,
    });
  });

  getProductBySlugPublic = asyncHandler(async (req, res) => {
    const product = await shopProductService.getProductBySlugPublic(
      req.params.slug
    );
    res.json({
      status: "success",
      data: product,
    });
  });

  getBatchProductsPublic = asyncHandler(async (req, res) => {
    const rawIds = req.query.ids
      ? String(req.query.ids).split(",")
      : req.body.ids || [];
    const result = await shopProductService.getBatchProductsPublic(rawIds);
    res.json({
      status: "success",
      data: result.products,
    });
  });

  recordEmbedAnalyticsEvent = asyncHandler(async (req, res) => {
    const clientIp =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";
    const result = await shopAnalyticsService.recordEvent(
      req.body,
      clientIp,
      userAgent
    );
    res.json({
      status: "success",
      data: result,
    });
  });

  initController = () => {
    // Admin routes (guarded by AdminMiddleware)
    this._router.post(`${this._rootPath}`, AdminMiddleware, this.createProduct);
    this._router.get(
      `${this._rootPath}/admin`,
      AdminMiddleware,
      this.getProductsAdmin
    );
    this._router.get(
      `${this._rootPath}/admin/:id`,
      AdminMiddleware,
      this.getProductByIdAdmin
    );
    this._router.patch(
      `${this._rootPath}/:id`,
      AdminMiddleware,
      this.updateProduct
    );
    this._router.patch(
      `${this._rootPath}/:id/stock`,
      AdminMiddleware,
      this.updateStock
    );
    this._router.delete(
      `${this._rootPath}/:id`,
      AdminMiddleware,
      this.deleteProduct
    );

    // Public catalog & embed routes
    this._router.get(`${this._rootPath}`, this.getPublishedProductsPublic);
    this._router.get(`${this._rootPath}/batch`, this.getBatchProductsPublic);
    this._router.post(
      `${this._rootPath}/analytics/event`,
      analyticsEventRateLimiter,
      this.recordEmbedAnalyticsEvent
    );
    this._router.get(
      `${this._rootPath}/:slug`,
      this.getProductBySlugPublic
    );
  };
}

module.exports = ShopProductController;
