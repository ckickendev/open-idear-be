const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { Post } = require("../models");
const { publishingEngine, aiFeatureRegistry } = require("../ai");

/**
 * =============================================================================
 *  PUBLISHING CONTROLLER
 *  controllers/publishing.controller.js
 *
 *  Design Decisions:
 *  - Exposes REST endpoint for publishing validations and checks.
 *  - Uses PublishingEngine to run registered preflight tasks.
 *  - Authenticated via AuthMiddleware and checks ownership of the draft.
 *  - Uses centralized aiFeatureRegistry for typed validation and telemetry.
 * =============================================================================
 */

class PublishingController extends Controller {
  _rootPath = "/api/publishing";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * POST /api/publishing/task
   * Executes a single preflight publishing task.
   */
  executePublishingTask = asyncHandler(async (req, res) => {
    const { task, articleId, context = {} } = req.body;

    if (!task) {
      return res.status(400).json({ error: "task ID is required." });
    }
    if (!articleId) {
      return res.status(400).json({ error: "articleId is required." });
    }

    // Validate and resolve task against centralized aiFeatureRegistry
    let feature;
    try {
      feature = aiFeatureRegistry.resolve(task);
    } catch (err) {
      return res.status(400).json({
        error: `Invalid publishing task "${task}". Must be a registered AI feature.`,
        registeredTasks: aiFeatureRegistry.getByCategory("publishing").map((f) => f.id),
      });
    }

    // 1. Fetch draft post details
    const post = await Post.findById(articleId);
    if (!post) {
      return res.status(404).json({ error: `Article with ID "${articleId}" not found.` });
    }

    // 2. Validate author ownership permissions
    if (post.author.toString() !== req.userInfo._id.toString()) {
      return res.status(403).json({ error: "Access denied. You do not own this article." });
    }

    // 3. Delegate execution to PublishingEngine
    const result = await publishingEngine.executeTask(
      task,
      post,
      {
        postId: articleId,
        userId: req.userInfo._id,
      },
      {
        context: {
          ...context,
          category: post.category ? String(post.category) : undefined,
          featureId: feature.id,
          telemetryKey: feature.telemetryKey,
        }
      }
    );

    res.json({
      status: "success",
      feature: {
        id: feature.id,
        name: feature.name,
        category: feature.category,
        telemetryKey: feature.telemetryKey,
        estimatedCreditCost: feature.estimatedCreditCost,
      },
      data: result,
    });
  });


  /**
   * Registers router endpoints
   */
  initController = () => {
    this._router.post(
      `${this._rootPath}/task`,
      AuthMiddleware,
      this.executePublishingTask
    );
  };
}

module.exports = PublishingController;
