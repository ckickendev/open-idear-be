const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { articleVersionService } = require("../services/articleVersion.services");

// =============================================================================
//  ARTICLE CONTROLLER (VERSIONING SYSTEM)
//  controllers/article.controller.js
//
//  Design Decisions:
//  - Implements RESTful versioning endpoints required by Sprint 1.
//  - GET /articles/:slug/history (Returns version timeline, changelog, author, badges).
//  - GET /articles/:slug/version/:version (Returns full content of specific snapshot).
//  - POST /articles/:id/version (Creates immutable new version; owner only; auto increment).
//  - PATCH /articles/:id/rollback/:version (Creates new version from old; never mutates history).
//  - Also registers matching aliases under /post for maximum frontend/API compatibility.
// =============================================================================

class ArticleController extends Controller {
  _rootPath = "/articles";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * GET /articles/:slug/history
   * Returns: version, changelog, source, createdAt, author
   */
  getHistory = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const result = await articleVersionService.getVersionHistory(slug);
    res.status(200).json({
      success: true,
      article: result.article,
      history: result.history,
    });
  });

  /**
   * GET /articles/:slug/version/:version
   * Returns full content of that specific historical version.
   */
  getVersion = asyncHandler(async (req, res) => {
    const { slug, version } = req.params;
    const result = await articleVersionService.getVersionContent(slug, version);
    res.status(200).json({
      success: true,
      article: result.article,
      version: result.version,
    });
  });

  /**
   * POST /articles/:id/version
   * Creates a new version.
   * Rules: authenticated, owner only, immutable versions, automatic version increment.
   */
  createVersion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userInfo?._id;
    const { markdown, html, blocks, changelog, source, isMajor } = req.body;

    const result = await articleVersionService.createNewVersion(id, userId, {
      markdown,
      html,
      blocks,
      changelog,
      source,
      isMajor,
    });

    res.status(201).json({
      success: true,
      message: `Version ${result.version.version} created successfully`,
      version: result.version,
      post: result.post,
    });
  });

  /**
   * PATCH /articles/:id/rollback/:version
   * Creates a NEW version from an old version.
   * Never mutates history.
   */
  rollback = asyncHandler(async (req, res) => {
    const { id, version } = req.params;
    const userId = req.userInfo?._id;
    const { changelog } = req.body;

    const result = await articleVersionService.rollbackVersion(
      id,
      userId,
      version,
      changelog
    );

    res.status(200).json({
      success: true,
      message: result.message,
      version: result.version,
      post: result.post,
    });
  });

  initController = () => {
    // Standard Sprint 1 REST routes: /articles/...
    this._router.get(`${this._rootPath}/:slug/history`, this.getHistory);
    this._router.get(`${this._rootPath}/:slug/version/:version`, this.getVersion);
    this._router.post(`${this._rootPath}/:id/version`, AuthMiddleware, this.createVersion);
    this._router.patch(`${this._rootPath}/:id/rollback/:version`, AuthMiddleware, this.rollback);

    // Compatibility aliases under /post/...
    this._router.get(`/post/:slug/history`, this.getHistory);
    this._router.get(`/post/:slug/version/:version`, this.getVersion);
    this._router.post(`/post/:id/version`, AuthMiddleware, this.createVersion);
    this._router.patch(`/post/:id/rollback/:version`, AuthMiddleware, this.rollback);
  };
}

module.exports = ArticleController;
