const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { CreateArticlePlanningWorkflow, CreateArticleWorkflow, WriterAgent, diagramAgent, PublisherOrchestrator, PublisherCoverImageService, BrandVoiceService, InternalLinkAgent } = require("../ai");
const { ContentStructureService } = require("../ai/content/contentStructure.service");
const { PublisherPipelineWorkflow } = require("../ai/workflow/publisherPipeline.workflow");
const { aiImageGenerationOrchestratorService } = require("../services/aiImageGeneration.services");
const { aiImageEditingOrchestratorService } = require("../services/aiImageEditing.services");
const { Post } = require("../models");
const mongoose = require("mongoose");
const { default: slugify } = require("slugify");
const fs = require("fs").promises;
const path = require("path");

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
        maxTokensOverride: 8192, // High token output cap for full 15-section articles
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

  /**
   * POST /ai/v1/diagram/generate
   * Generates a Mermaid diagram from editor content.
   *
   * Body:
   *   editorContent           string  (required)
   *   diagramType             string  (required) — flowchart | sequence | er | class | architecture | auto
   *   additionalInstructions  string  (optional)
   */
  generateDiagram = asyncHandler(async (req, res) => {
    const { editorContent, diagramType, additionalInstructions } = req.body;

    if (!editorContent || !editorContent.trim()) {
      return res.status(400).json({ error: "editorContent is required" });
    }

    const validTypes = ["flowchart", "sequence", "er", "class", "architecture", "auto"];
    if (!diagramType || !validTypes.includes(diagramType)) {
      return res.status(400).json({
        error: `diagramType must be one of: ${validTypes.join(", ")}`
      });
    }

    const result = await diagramAgent.generate({
      editorContent,
      diagramType,
      additionalInstructions
    });

    res.json({
      status: "success",
      data: result
    });
  });

  /**
   * GET /ai/v1/telemetry
   * Aggregates AI system stats from logs/ai.log.
   */
  getTelemetry = asyncHandler(async (req, res) => {
    const logPath = path.resolve(process.cwd(), "logs/ai.log");
    
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;
    const recentRequests = [];

    try {
      const content = await fs.readFile(logPath, "utf-8");
      const lines = content.split("\n").filter(line => line.trim());
      
      lines.forEach((line) => {
        try {
          const entry = JSON.parse(line);
          totalRequests++;
          if (entry.success) {
            successfulRequests++;
          } else {
            failedRequests++;
          }
          
          if (entry.tokenUsage) {
            totalTokens += (entry.tokenUsage.totalTokens || 0);
          }
          
          totalCost += (entry.estimatedCost || 0);
          totalDuration += (entry.executionTimeMs || 0);
          
          recentRequests.push({
            id: entry.id,
            timestamp: entry.timestamp,
            model: entry.model,
            success: entry.success,
            durationMs: entry.executionTimeMs,
            cost: entry.estimatedCost,
            promptName: entry.promptName,
            error: entry.error ? entry.error.message : null,
          });
        } catch (parseErr) {
          // ignore malformed log lines
        }
      });
    } catch (err) {
      if (err.code !== "ENOENT") {
        return res.status(500).json({ error: "Failed to read telemetry log." });
      }
    }

    const averageDuration = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;
    const errorRate = totalRequests > 0 ? Number(((failedRequests / totalRequests) * 100).toFixed(1)) : 0;

    res.json({
      status: "success",
      data: {
        metrics: {
          totalRequests,
          successfulRequests,
          failedRequests,
          errorRate,
          totalTokens,
          totalCost: Number(totalCost.toFixed(4)),
          averageDuration,
        },
        recentRequests: recentRequests.reverse().slice(0, 10), // return last 10 requests
      }
    });
  });

  /**
   * POST /ai/v1/enhance
   * Triggers the AI content enhancement pipeline.
   */
  enhanceContent = asyncHandler(async (req, res) => {
    const { _id: userId } = req.userInfo;
    const { markdown, options } = req.body;

    if (!markdown || !markdown.trim()) {
      return res.status(400).json({ error: "markdown content is required" });
    }

    const { enhancementPipeline } = require("../services");
    const result = await enhancementPipeline.execute(userId, markdown, options);

    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * POST /ai/v1/enhance-images
   * Triggers the AI Image Enhancement Pipeline specifically for image review modal.
   */
  enhanceImages = asyncHandler(async (req, res) => {
    const { _id: userId } = req.userInfo;
    const { markdown, title, maxImages } = req.body;

    if (!markdown || !markdown.trim()) {
      return res.status(400).json({ error: "markdown content is required" });
    }

    const { enhancementPipeline } = require("../services");
    const result = await enhancementPipeline.execute(userId, markdown, {
      title,
      maxImages: maxImages || 4,
      enableImageEnhancement: true,
    });

    res.json({
      status: "success",
      data: {
        enhancedMarkdown: result.enhancedMarkdown,
        insertedAssets: result.insertedAssets || result.insertedImages || [],
        unresolvedImages: result.unresolvedImages || [],
        statistics: result.statistics || {},
        warnings: result.warnings || [],
        executionTimeMs: result.executionTimeMs,
      },
    });
  });

  /**
   * POST /ai/v1/structure
   * Converts Markdown and Growth Results into structured ArticleBlock[].
   */
  structureArticle = asyncHandler(async (req, res) => {
    const { markdown, growthResults } = req.body;

    const result = ContentStructureService.buildArticleStructure({
      markdown: markdown || "",
      growthResults: growthResults || null,
    });

    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * POST /ai/v1/publisher/generate
   * Full server-side Publish-by-AI pipeline:
   *   Planner → Writer (non-streaming) → ContentStructure → SEO derivation.
   * Returns a ready-to-use PublisherResponse (title, slug, blocks, SEO, tags).
   */
  publisherGenerate = asyncHandler(async (req, res) => {
    const {
      topic,
      audience,
      goal,
      tone,
      length,
      category,
      additionalInstructions,
    } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "topic is required" });
    }

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const workflow = new PublisherPipelineWorkflow();
    const result = await workflow.execute(
      {
        topic: topic.trim(),
        audience: audience || "developers",
        goal: goal || "educate",
        tone: tone || "informative",
        length: length || "medium",
        category: category || "general",
        additionalInstructions: additionalInstructions || "",
      },
      abortController.signal
    );

    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * POST /ai/v1/publisher
   * Multi-agent Publisher Orchestrator endpoint:
   * State Machine: IDLE → PLANNING → WRITING → SEO → VALIDATING → DONE
   */
  publishMultiAgent = asyncHandler(async (req, res) => {
    const { topic, audience, additionalInstructions } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "topic is required" });
    }

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const orchestrator = new PublisherOrchestrator();
    const resultContext = await orchestrator.execute(
      {
        topic: topic.trim(),
        audience: audience || "developers",
        additionalInstructions: additionalInstructions || "",
      },
      abortController.signal
    );

    if (resultContext.state === "FAILED") {
      return res.status(422).json({
        status: "failed",
        error: resultContext.error,
        data: resultContext,
      });
    }

    res.json({
      status: "success",
      data: {
        title: resultContext.plan?.title || "",
        slug: resultContext.seo?.slug || "",
        description: resultContext.seo?.metaDescription || "",
        category: resultContext.seo?.category || "general",
        tags: resultContext.seo?.tags || [],
        blocks: resultContext.writerOutput?.blocks || [],
        coverImage: resultContext.coverImage || null,
        validation: resultContext.validation,
        state: resultContext.state,
      },
    });
  });

  /**
   * POST /ai/v1/publisher/cover-image
   * Regenerates AI Cover Image:
   *   1. ImageAgent creates prompt
   *   2. Generates image
   *   3. Uploads Cloudinary
   *   4. Saves to Media Library schema
   */
  regeneratePublisherCoverImage = asyncHandler(async (req, res) => {
    const { _id: userId } = req.userInfo;
    const { title, keywords, customPrompt } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const service = new PublisherCoverImageService();
    const coverImage = await service.generateAndSaveCoverImage(
      {
        title: title.trim(),
        keywords: keywords || [],
        customPrompt: customPrompt || "",
        userId: userId ? userId.toString() : undefined,
      },
      abortController.signal
    );

    res.json({
      status: "success",
      data: coverImage,
    });
  });

  /**
   * POST /ai/v1/publisher/one-click
   * One-Click Autonomous Publisher pipeline:
   *   1. Planner (Outline & Intent)
   *   2. Writer (Markdown & Blocks-v1)
   *   3. SEO (Slug & Meta)
   *   4. Cover Image (Cloudinary & Media)
   *   5. Validator (Audit)
   *   6. Save MongoDB Draft
   * Returns { draftId: post._id, title, slug }
   */
  oneClickPublish = asyncHandler(async (req, res) => {
    const { _id: userId } = req.userInfo;
    const { topic, audience, tone, length, additionalInstructions } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "topic is required" });
    }

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const orchestrator = new PublisherOrchestrator();
    const resultContext = await orchestrator.execute(
      {
        topic: topic.trim(),
        audience: audience || "developers",
        additionalInstructions: additionalInstructions || "",
        userId: userId ? userId.toString() : undefined,
      },
      abortController.signal
    );

    if (resultContext.state === "FAILED") {
      return res.status(422).json({
        status: "failed",
        error: resultContext.error,
        data: resultContext,
      });
    }

    // Save Draft Post in MongoDB
    const postTitle = resultContext.plan?.title || topic.trim();
    let rawSlug = resultContext.seo?.slug || (slugify ? slugify(postTitle, { lower: true, strict: true }) : postTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    let postSlug = rawSlug.replace(/^-+|-+$/g, "") || `post-${Date.now()}`;
    
    // Ensure slug uniqueness
    const existingPost = await Post.findOne({ slug: postSlug });
    if (existingPost) {
      postSlug = `${postSlug}-${Date.now().toString(36)}`;
    }

    const rawMarkdown = resultContext.writerOutput?.rawMarkdown || "";

    const postId = new mongoose.Types.ObjectId();
    const draftPost = await Post.create({
      _id: postId,
      title: postTitle,
      slug: postSlug,
      description: resultContext.seo?.metaDescription || "",
      content: rawMarkdown,
      text: rawMarkdown,
      blocks: resultContext.writerOutput?.blocks || [],
      contentVersion: "blocks-v1",
      published: false, // Save as Draft
      author: userId,
      image: resultContext.coverImage?._id ? resultContext.coverImage._id : undefined,
    });

    res.json({
      status: "success",
      data: {
        draftId: draftPost._id.toString(),
        title: draftPost.title,
        slug: draftPost.slug,
        coverImage: resultContext.coverImage,
        state: "DONE",
      },
    });
  });

  /**
   * GET /ai/v1/brand-voice
   * Returns list of user brand voice profiles + system default.
   */
  getBrandVoices = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id?.toString();
    const service = new BrandVoiceService();
    const profiles = await service.getProfiles(userId);

    res.json({
      status: "success",
      data: profiles,
    });
  });

  /**
   * POST /ai/v1/brand-voice
   * Creates a new custom brand voice profile for user.
   */
  createBrandVoice = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id?.toString();
    const { name, tone, emoji, language, codeStyle } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const service = new BrandVoiceService();
    const profile = await service.createProfile(userId, {
      name: name.trim(),
      tone: tone || "Friendly Senior Engineer",
      emoji: emoji || "low",
      language: language || "Vietnamese",
      codeStyle: codeStyle || "TypeScript",
    });

    res.json({
      status: "success",
      data: profile,
    });
  });

  /**
   * DELETE /ai/v1/brand-voice/:id
   * Deletes a user custom brand voice profile.
   */
  deleteBrandVoice = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id?.toString();
    const { id } = req.params;

    const service = new BrandVoiceService();
    const deleted = await service.deleteProfile(userId, id);

    res.json({
      status: "success",
      data: { deleted, id },
    });
  });

  /**
   * POST /ai/v1/internal-link
   * Automatically searches MongoDB for related published posts and contextually inserts internal links.
   */
  processInternalLinks = asyncHandler(async (req, res) => {
    const { blocks, currentPostId } = req.body;

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ error: "blocks array is required" });
    }

    const agent = new InternalLinkAgent();
    const result = await agent.execute({
      blocks,
      currentPostId,
    });

    res.json({
      status: "success",
      data: result.data,
    });
  });

  initController = () => {
    this._router.post(`${this._rootPath}/planner`,            AuthMiddleware, this.planArticle);
    this._router.post(`${this._rootPath}/writer`,             AuthMiddleware, this.writeArticle);
    this._router.post(`${this._rootPath}/writer/stream`,      AuthMiddleware, this.streamArticle);
    this._router.post(`${this._rootPath}/structure`,          AuthMiddleware, this.structureArticle);
    this._router.post(`${this._rootPath}/enhance`,            AuthMiddleware, this.enhanceContent);
    this._router.post(`${this._rootPath}/enhance-images`,     AuthMiddleware, this.enhanceImages);
    this._router.post(`${this._rootPath}/publisher/generate`, AuthMiddleware, this.publisherGenerate);
    this._router.post(`${this._rootPath}/publisher`,          AuthMiddleware, this.publishMultiAgent);
    this._router.post(`${this._rootPath}/publisher/cover-image`, AuthMiddleware, this.regeneratePublisherCoverImage);
    this._router.post(`${this._rootPath}/publisher/one-click`,   AuthMiddleware, this.oneClickPublish);
    this._router.post(`${this._rootPath}/internal-link`,        AuthMiddleware, this.processInternalLinks);
    this._router.get( `${this._rootPath}/brand-voice`,          AuthMiddleware, this.getBrandVoices);
    this._router.post(`${this._rootPath}/brand-voice`,         AuthMiddleware, this.createBrandVoice);
    this._router.delete(`${this._rootPath}/brand-voice/:id`,   AuthMiddleware, this.deleteBrandVoice);
    this._router.get( `${this._rootPath}/image/providers`,    AuthMiddleware, this.getImageProviders);
    this._router.post(`${this._rootPath}/image/generate`,     AuthMiddleware, this.generateImage);
    this._router.post(`${this._rootPath}/image/edit`,         AuthMiddleware, this.editImage);
    this._router.post(`${this._rootPath}/diagram/generate`,   AuthMiddleware, this.generateDiagram);
    this._router.get( `${this._rootPath}/telemetry`,          AuthMiddleware, this.getTelemetry);
  };
}

module.exports = AIController;

