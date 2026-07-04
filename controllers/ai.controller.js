const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { CreateArticlePlanningWorkflow, CreateArticleWorkflow, WriterAgent } = require("../ai");
const { aiImageGenerationOrchestratorService } = require("../services/aiImageGeneration.services");
const { aiImageEditingOrchestratorService } = require("../services/aiImageEditing.services");

// =============================================================================
//  AI CONTROLLER
//  controllers/ai.controller.js
//
//  API controller exposing editorial agent workflows.
//
//  Routes:
//  POST /ai/v1/planner           — triggers the article planning workflow.
//  POST /ai/v1/writer            — triggers the article writing/drafting workflow.
//  POST /ai/v1/writer/stream     — SSE streaming article writing.
//  POST /ai/v1/image/generate    — AI image generation → save to Media Library.
//  GET  /ai/v1/image/providers   — list available image generation providers.
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

  // ───────────────────────────────────────────────────────────────────────────
  //  Image Generation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * GET /ai/v1/image/providers
   * Returns metadata about all registered image generation providers.
   */
  getImageProviders = asyncHandler(async (req, res) => {
    const providers = aiImageGenerationOrchestratorService.getProviders();
    res.json({ status: "success", data: { providers } });
  });

  /**
   * POST /ai/v1/image/generate
   * Generate 1–4 images from a text prompt and save them to the Media Library.
   *
   * Body:
   *   prompt           string  (required)
   *   negativePrompt   string  (optional)
   *   aspectRatio      "1:1" | "16:9" | "9:16" | "4:3" | "3:4"  (default "1:1")
   *   style            "photorealistic" | "digital-art" | "illustration" |
   *                    "sketch" | "cinematic" | "minimalist"  (default "photorealistic")
   *   count            number 1–4 (default 1)
   *   providerId       string (optional — use specific provider)
   *   folderId         string (optional — save into a folder)
   */
  generateImage = asyncHandler(async (req, res) => {
    const {
      prompt,
      negativePrompt,
      aspectRatio,
      style,
      count,
      providerId,
      folderId,
    } = req.body;

    // Validate
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const validRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    if (aspectRatio && !validRatios.includes(aspectRatio)) {
      return res.status(400).json({
        error: `Invalid aspectRatio. Must be one of: ${validRatios.join(", ")}`
      });
    }

    const validStyles = ["photorealistic", "digital-art", "illustration", "sketch", "cinematic", "minimalist"];
    if (style && !validStyles.includes(style)) {
      return res.status(400).json({
        error: `Invalid style. Must be one of: ${validStyles.join(", ")}`
      });
    }

    const safeCount = Math.min(Math.max(1, parseInt(count) || 1), 4);

    const result = await aiImageGenerationOrchestratorService.generateAndSave(
      req.user._id,
      {
        prompt: String(prompt).trim(),
        negativePrompt: negativePrompt ? String(negativePrompt).trim() : undefined,
        aspectRatio: aspectRatio || "1:1",
        style: style || "photorealistic",
        count: safeCount,
        providerId: providerId || undefined,
        folderId: folderId || null,
      }
    );

    res.json({
      status: "success",
      data: {
        assets: result.assets,
        providerId: result.providerId,
        revisedPrompts: result.revisedPrompts,
        count: result.assets.length,
      },
    });
  });

  /**
   * POST /ai/v1/image/edit
   * Edit an existing Media Library image and save the result as a NEW asset.
   *
   * Body:
   *   sourceMediaId  string  (required) — ID of the MediaAsset to edit
   *   operation      string  (required) — one of: remove-background | upscale |
   *                          crop | expand | replace-object | change-style
   *
   *   // Operation-specific fields:
   *   factor         2 | 4                    (upscale)
   *   left,top,width,height  number           (crop, pixels)
   *   direction      top|right|bottom|left|all (expand)
   *   fillPrompt     string                   (expand — optional)
   *   pixels         number                   (expand — default 256)
   *   targetDescription     string            (replace-object)
   *   replacementDescription string           (replace-object)
   *   preset         string                   (change-style)
   *   customPrompt   string                   (change-style — optional)
   */
  editImage = asyncHandler(async (req, res) => {
    const { sourceMediaId, operation, ...rest } = req.body;

    if (!sourceMediaId || !String(sourceMediaId).trim()) {
      return res.status(400).json({ error: "sourceMediaId is required" });
    }

    const validOps = ["remove-background", "upscale", "crop", "expand", "replace-object", "change-style"];
    if (!operation || !validOps.includes(operation)) {
      return res.status(400).json({
        error: `operation must be one of: ${validOps.join(", ")}`
      });
    }

    // Build discriminated-union params
    let params;
    switch (operation) {
      case "remove-background":
        params = { operation };
        break;
      case "upscale": {
        const factor = parseInt(rest.factor) || 2;
        if (factor !== 2 && factor !== 4) {
          return res.status(400).json({ error: "upscale factor must be 2 or 4" });
        }
        params = { operation, factor };
        break;
      }
      case "crop": {
        const { left, top, width, height } = rest;
        if ([left, top, width, height].some(v => v === undefined || v === null || isNaN(Number(v)))) {
          return res.status(400).json({ error: "crop requires: left, top, width, height (numbers)" });
        }
        params = { operation, left: Number(left), top: Number(top), width: Number(width), height: Number(height) };
        break;
      }
      case "expand": {
        const validDirs = ["top", "right", "bottom", "left", "all"];
        const direction = rest.direction || "all";
        if (!validDirs.includes(direction)) {
          return res.status(400).json({ error: `expand direction must be one of: ${validDirs.join(", ")}` });
        }
        params = {
          operation,
          direction,
          fillPrompt: rest.fillPrompt || undefined,
          pixels: rest.pixels ? Number(rest.pixels) : 256,
        };
        break;
      }
      case "replace-object": {
        if (!rest.targetDescription?.trim() || !rest.replacementDescription?.trim()) {
          return res.status(400).json({ error: "replace-object requires: targetDescription, replacementDescription" });
        }
        params = {
          operation,
          targetDescription: String(rest.targetDescription).trim(),
          replacementDescription: String(rest.replacementDescription).trim(),
        };
        break;
      }
      case "change-style": {
        const validPresets = ["oil-painting","watercolor","anime","sketch","pixel-art","3d-render","vintage-photo","neon-cyberpunk"];
        if (!rest.preset || !validPresets.includes(rest.preset)) {
          return res.status(400).json({ error: `change-style preset must be one of: ${validPresets.join(", ")}` });
        }
        params = {
          operation,
          preset: rest.preset,
          customPrompt: rest.customPrompt || undefined,
        };
        break;
      }
    }

    const result = await aiImageEditingOrchestratorService.editAndSave(
      req.user._id,
      { sourceMediaId: String(sourceMediaId).trim(), params }
    );

    res.json({
      status: "success",
      data: {
        asset: result.asset,
        operation: result.operation,
        summary: result.summary,
        sourceMediaId: result.sourceMediaId,
      },
    });
  });

  initController = () => {
    this._router.post(`${this._rootPath}/planner`,       AuthMiddleware, this.planArticle);
    this._router.post(`${this._rootPath}/writer`,        AuthMiddleware, this.writeArticle);
    this._router.post(`${this._rootPath}/writer/stream`, AuthMiddleware, this.streamArticle);
    this._router.get( `${this._rootPath}/image/providers`, AuthMiddleware, this.getImageProviders);
    this._router.post(`${this._rootPath}/image/generate`,  AuthMiddleware, this.generateImage);
    this._router.post(`${this._rootPath}/image/edit`,       AuthMiddleware, this.editImage);
  };
}

module.exports = AIController;
