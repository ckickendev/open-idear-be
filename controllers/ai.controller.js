const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { CreateArticlePlanningWorkflow, CreateArticleWorkflow, WriterAgent } = require("../ai");

// =============================================================================
//  AI CONTROLLER
//  controllers/ai.controller.js
//
//  API controller exposing editorial agent workflows.
//
//  Routes:
//  POST /ai/v1/planner  — triggers the article planning workflow.
//  POST /ai/v1/writer   — triggers the article writing/drafting workflow.
//
//  Design Decisions:
//  - Strictly routes, validates, and responds. Contains zero AI model logic.
//  - Protected by AuthMiddleware.
// =============================================================================

class AIController extends Controller {
  _rootPath = "/ai/v1";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * POST /ai/v1/planner
   * Triggers the article outline planning workflow.
   */
  planArticle = asyncHandler(async (req, res) => {
    const { topic, audience, goal, tone, length, category } = req.body;

    // 1. Validate request parameters
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "topic is required" });
    }
    if (!audience || !audience.trim()) {
      return res.status(400).json({ error: "audience is required" });
    }
    if (!goal || !goal.trim()) {
      return res.status(400).json({ error: "goal is required" });
    }
    if (!tone || !tone.trim()) {
      return res.status(400).json({ error: "tone is required" });
    }
    if (!length || !length.trim()) {
      return res.status(400).json({ error: "length is required" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ error: "category is required" });
    }

    // 2. Instantiate and execute the planning workflow
    const workflow = new CreateArticlePlanningWorkflow();
    const result = await workflow.execute({
      topic: topic.trim(),
      audience: audience.trim(),
      goal: goal.trim(),
      tone: tone.trim(),
      length: length.trim(),
      category: category.trim(),
    }, {
      context: {
        language: req.body.language || "en",
        userPreference: req.body.userPreference || "",
      }
    });

    // 3. Return JSON response
    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * POST /ai/v1/writer
   * Triggers the article writing and compilation workflow.
   */
  writeArticle = asyncHandler(async (req, res) => {
    const { plan, additionalInstructions } = req.body;

    // 1. Validate request parameters
    if (!plan) {
      return res.status(400).json({ error: "plan is required" });
    }
    if (!plan.title || !plan.title.trim()) {
      return res.status(400).json({ error: "plan.title is required" });
    }
    if (!Array.isArray(plan.outline) || plan.outline.length === 0) {
      return res.status(400).json({ error: "plan.outline is required and must be a non-empty array" });
    }

    // 2. Instantiate and execute the writing workflow
    const workflow = new CreateArticleWorkflow();
    const result = await workflow.execute({
      plan,
      additionalInstructions: additionalInstructions || "",
    }, {
      context: {
        language: req.body.language || "en",
        userPreference: req.body.userPreference || "",
      }
    });

    // 3. Return JSON response
    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * POST /ai/v1/writer/stream
   * Streams the generated article content as raw Markdown chunks.
   * Supports client connection close cancellation via AbortSignal.
   */
  streamArticle = asyncHandler(async (req, res) => {
    const { plan, additionalInstructions } = req.body;

    // 1. Validate request parameters
    if (!plan) {
      return res.status(400).json({ error: "plan is required" });
    }
    if (!plan.title || !plan.title.trim()) {
      return res.status(400).json({ error: "plan.title is required" });
    }
    if (!Array.isArray(plan.outline) || plan.outline.length === 0) {
      return res.status(400).json({ error: "plan.outline is required and must be a non-empty array" });
    }

    // 2. Set event stream headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Ensure headers are sent immediately

    const abortController = new AbortController();

    // Bind connection close to abort signal for cooperative cancellation
    req.on("close", () => {
      console.log("[AIController] Client closed connection, aborting writing stream...");
      abortController.abort();
    });

    // 3. Instantiate WriterAgent
    const agent = new WriterAgent();

    try {
      const stream = agent.executeStream({
        plan,
        additionalInstructions: additionalInstructions || "",
      }, {
        promptVersionOverride: "v2", // Force text-only markdown prompt (writer.v2.md)
        signal: abortController.signal,
        context: {
          language: req.body.language || "en",
          userPreference: req.body.userPreference || "",
        }
      });

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        console.log("[AIController] Article writing successfully aborted by request signal.");
        return res.end();
      }
      console.error("[AIController] Streaming failure encountered:", err);
      res.write(`data: ${JSON.stringify({ error: err.message || "Streaming failed" })}\n\n`);
      res.end();
    }
  });

  initController = () => {
    this._router.post(
      `${this._rootPath}/planner`,
      AuthMiddleware,
      this.planArticle
    );
    this._router.post(
      `${this._rootPath}/writer`,
      AuthMiddleware,
      this.writeArticle
    );
    this._router.post(
      `${this._rootPath}/writer/stream`,
      AuthMiddleware,
      this.streamArticle
    );
  };
}

module.exports = AIController;
