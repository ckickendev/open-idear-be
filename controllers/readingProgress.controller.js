const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { readingProgressService } = require("../services/readingProgress.services");

// =============================================================================
//  READING PROGRESS CONTROLLER
//  controllers/readingProgress.controller.js
//
//  Design Decisions:
//  - Implements RESTful Reading Progress API required by Sprint 1.
//  - GET /reading/continue (Authenticated: returns recently opened in-progress articles).
//  - GET /reading/stats/me (Authenticated: returns completed articles, hours read, streak).
//  - GET /reading/:articleId (Authenticated: returns reading progress and last heading/paragraph).
//  - PUT /reading/:articleId (Authenticated: debounced update with monotonic safeguard).
// =============================================================================

class ReadingProgressController extends Controller {
  _rootPath = "/reading";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * GET /reading/continue
   * Returns list of recently read articles with progress and remaining minutes.
   */
  getContinueReading = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 6;

    const items = await readingProgressService.getContinueReading(userId, limit);

    res.status(200).json({
      success: true,
      data: items,
    });
  });

  /**
   * GET /reading/stats/me
   * Returns reading statistics for profile page.
   */
  getStats = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const stats = await readingProgressService.getUserReadingStats(userId);

    res.status(200).json({
      success: true,
      stats,
    });
  });

  /**
   * GET /reading/:articleId
   * Returns saved reading position and progress for an article.
   */
  getProgress = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { articleId } = req.params;

    const progress = await readingProgressService.getProgress(userId, articleId);

    res.status(200).json({
      success: true,
      data: progress,
    });
  });

  /**
   * PUT /reading/:articleId
   * Updates reading progress, last heading, and last paragraph.
   */
  updateProgress = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { articleId } = req.params;
    const { progress, heading, lastHeadingId, paragraph, lastParagraphIndex, isBottomReached } = req.body;

    const result = await readingProgressService.updateProgress(userId, articleId, {
      progress,
      heading: heading || lastHeadingId,
      paragraph: paragraph ?? lastParagraphIndex,
      isBottomReached,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  });

  initController = () => {
    this._router.get(`${this._rootPath}/continue`, AuthMiddleware, this.getContinueReading);
    this._router.get(`${this._rootPath}/stats/me`, AuthMiddleware, this.getStats);
    this._router.get(`${this._rootPath}/:articleId`, AuthMiddleware, this.getProgress);
    this._router.put(`${this._rootPath}/:articleId`, AuthMiddleware, this.updateProgress);
  };
}

module.exports = ReadingProgressController;
