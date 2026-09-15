const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { Post } = require("../models");
const { smartPublishWorkflow } = require("../ai/workflow/smartPublish.workflow");

/**
 * =============================================================================
 *  SMART PUBLISH CONTROLLER
 *  controllers/smartPublish.controller.js
 *
 *  Design Decisions:
 *  - Thin controller: validates input, checks ownership, delegates to workflow.
 *  - Returns partial results even when some tasks fail (resilient UX).
 *  - Protected by AuthMiddleware.
 * =============================================================================
 */

class SmartPublishController extends Controller {
  _rootPath = "/api/smart-publish";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * POST /api/smart-publish/fill
   * Triggers the Smart Publish workflow to auto-fill metadata.
   */
  smartFill = asyncHandler(async (req, res) => {
    const { articleId } = req.body;

    if (!articleId) {
      return res.status(400).json({ error: "articleId is required." });
    }

    // 1. Fetch draft post
    const post = await Post.findById(articleId);
    if (!post) {
      return res.status(404).json({
        error: `Article with ID "${articleId}" not found.`,
      });
    }

    // 2. Validate author ownership
    if (post.author.toString() !== req.userInfo._id.toString()) {
      return res.status(403).json({
        error: "Access denied. You do not own this article.",
      });
    }

    // 3. Validate content exists
    const content = post.content || post.text || "";
    const title = post.title || "Untitled";

    if (!content.trim()) {
      return res.status(400).json({
        error: "Article has no content. Write content before using Smart Fill.",
      });
    }

    // 4. Delegate to workflow
    const result = await smartPublishWorkflow.execute({
      title,
      content,
      userId: req.userInfo._id.toString(),
    });

    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * Registers router endpoints.
   */
  initController = () => {
    this._router.post(
      `${this._rootPath}/fill`,
      AuthMiddleware,
      this.smartFill
    );
  };
}

module.exports = SmartPublishController;
