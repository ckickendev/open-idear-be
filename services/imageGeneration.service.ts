// =============================================================================
//  IMAGE GENERATION SERVICE (SPRINT 3)
//  services/imageGeneration.service.ts
//
//  Design Decisions:
//  - Strictly decoupled provider abstraction for AI technical illustrations.
//  - Provider registry integration (Gemini Imagen 3, OpenAI, Ideogram).
//  - Technical Style Presets (Isometric, Blueprint, Flat Vector, 3D Technical).
//  - Cost Protection:
//      * Sliding-window per-user generation limits (429 Too Many Requests).
//      * Request Idempotency: in-flight duplicate request coalescing.
//      * Fuzzy duplicate matching to reuse existing assets.
//      * Transient network retry policy & timeout handling.
//  - Cloudinary upload with offline/vector fallback.
//  - Asset schema metadata persistence (sourceType="ai", provider, model, prompt, style, aspectRatio).
//  - Telemetry: image_generation_started, completed, failed, accepted, regenerated.
// =============================================================================

import crypto from "crypto";
import mongoose from "mongoose";
import cloudinary from "../utils/cloudinary";
import { imageGeneratorRegistry } from "../ai/image/imageGenerator.registry";
import type { IllustrationPreset, ImageGenerator } from "../ai/image/imageGenerator.interface";

const Asset = require("../models/asset.schema");
const MediaAsset = require("../models/mediaAsset.schema");

export interface GenerateTechnicalIllustrationOptions {
  prompt: string;
  style?: IllustrationPreset | string;
  aspectRatio?: string;
  seed?: number;
  userId?: string;
  suggestionId?: string;
  force?: boolean;
  signal?: AbortSignal;
}

export interface ImageTelemetryEvent {
  event:
    | "image_generation_started"
    | "image_generation_completed"
    | "image_generation_failed"
    | "image_generation_accepted"
    | "image_generation_regenerated";
  provider?: string;
  model?: string;
  latency?: number;
  userId?: string;
  assetId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class ImageGenerationService {
  // ─── Constants & Supported Values ──────────────────────────────────────────
  public static readonly SUPPORTED_STYLES = [
    "technical-isometric",
    "isometric",
    "blueprint",
    "flat-vector",
    "flat_vector",
    "3d-technical",
    "3d_technical",
  ];

  public static readonly SUPPORTED_ASPECT_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
  ];

  // ─── Style Presets Modifiers ────────────────────────────────────────────────
  public static readonly PRESET_MODIFIERS: Record<string, (prompt: string) => string> = {
    isometric: (prompt: string) =>
      `Clean modern isometric technical illustration of ${prompt.trim()}, isometric perspective, 30-degree orthographic angle, software engineering system architecture diagram, crisp geometric components, vibrant tech color palette (electric blue, deep slate, luminous violet accents), high contrast, minimalist vector lines, soft ambient occlusion, clean minimalist dark background, technical schematic infographic, no photorealism, no human faces`,
    "technical_isometric": (prompt: string) => ImageGenerationService.PRESET_MODIFIERS.isometric(prompt),
    "technical-isometric": (prompt: string) => ImageGenerationService.PRESET_MODIFIERS.isometric(prompt),

    blueprint: (prompt: string) =>
      `Architectural engineering blueprint schematic of ${prompt.trim()}, technical cyan and crisp white line art on deep Prussian blue grid background, precise CAD drafting lines, exploded system view, dimension markers, technical typography labels, clean vector aesthetics, software engineering diagram, no photorealism`,

    flat_vector: (prompt: string) =>
      `Modern flat vector technical icon illustration of ${prompt.trim()}, clean bold outlines, sleek minimal geometric shapes, solid color blocks, developer documentation graphic style, Notion and Linear UI visual language, cohesive harmonious tech palette, sharp vector shapes, zero shadows, no photorealism`,
    "flat-vector": (prompt: string) => ImageGenerationService.PRESET_MODIFIERS.flat_vector(prompt),

    "3d_technical": (prompt: string) =>
      `3D technical render illustration of ${prompt.trim()}, smooth matte clay and frosted glass shaders, volumetric soft studio lighting, high precision engineering model, clean dark tech aesthetic, floating decoupled modules showing distributed system architecture, isometric depth of field, high detail 3D infographic, no photorealism`,
    "3d-technical": (prompt: string) => ImageGenerationService.PRESET_MODIFIERS["3d_technical"](prompt),
  };

  // ─── Cost Protection & Idempotency State ─────────────────────────────────────
  private readonly inFlightRequests = new Map<string, Promise<any>>();
  private readonly userGenerationTimestamps = new Map<string, number[]>();
  private readonly RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly RATE_LIMIT_MAX_REQUESTS = 20;

  // ─── Telemetry In-Memory Log ────────────────────────────────────────────────
  private readonly telemetryEvents: ImageTelemetryEvent[] = [];

  /**
   * Normalizes any supported style alias to standard format.
   */
  public normalizeStyle(style?: string): IllustrationPreset {
    const s = (style || "isometric").toLowerCase().trim().replace("-", "_");
    if (s === "technical_isometric" || s === "isometric") return "isometric";
    if (s === "blueprint") return "blueprint";
    if (s === "flat_vector") return "flat_vector";
    if (s === "3d_technical") return "3d_technical";
    return "isometric";
  }

  /**
   * Validates if a style string is supported.
   */
  public isValidStyle(style?: string): boolean {
    if (!style) return false;
    const s = style.toLowerCase().trim();
    return ImageGenerationService.SUPPORTED_STYLES.includes(s);
  }

  /**
   * Validates if an aspect ratio string is supported.
   */
  public isValidAspectRatio(ratio?: string): boolean {
    if (!ratio) return false;
    return ImageGenerationService.SUPPORTED_ASPECT_RATIOS.includes(ratio.trim());
  }

  /**
   * Applies the selected style preset to expand the raw user prompt.
   */
  public enhancePromptWithPreset(prompt: string, style?: string): string {
    const cleanPrompt = (prompt || "").trim();
    const normalized = this.normalizeStyle(style);
    const modifier = ImageGenerationService.PRESET_MODIFIERS[normalized];

    if (modifier) {
      return modifier(cleanPrompt);
    }
    return ImageGenerationService.PRESET_MODIFIERS.isometric(cleanPrompt);
  }

  // ─── Rate Limiting (Cost Protection) ────────────────────────────────────────
  public checkRateLimit(userId?: string): void {
    if (!userId) return;
    const now = Date.now();
    const timestamps = (this.userGenerationTimestamps.get(userId) || []).filter(
      (ts) => now - ts < this.RATE_LIMIT_WINDOW_MS
    );

    if (timestamps.length >= this.RATE_LIMIT_MAX_REQUESTS) {
      const err: any = new Error(
        `Rate limit exceeded. Maximum ${this.RATE_LIMIT_MAX_REQUESTS} image generations per 10 minutes.`
      );
      err.status = 429;
      err.code = "RATE_LIMIT_EXCEEDED";
      throw err;
    }

    timestamps.push(now);
    this.userGenerationTimestamps.set(userId, timestamps);
  }

  public resetRateLimits(userId?: string): void {
    if (userId) {
      this.userGenerationTimestamps.delete(userId);
    } else {
      this.userGenerationTimestamps.clear();
    }
  }

  // ─── Telemetry Helpers ──────────────────────────────────────────────────────
  public recordTelemetry(event: ImageTelemetryEvent): void {
    this.telemetryEvents.push({ ...event });
    if (this.telemetryEvents.length > 500) {
      this.telemetryEvents.shift();
    }
  }

  public getTelemetryEvents(eventFilter?: ImageTelemetryEvent["event"]): ImageTelemetryEvent[] {
    if (eventFilter) {
      return this.telemetryEvents.filter((e) => e.event === eventFilter);
    }
    return [...this.telemetryEvents];
  }

  public clearTelemetry(): void {
    this.telemetryEvents.length = 0;
  }

  // ─── Fuzzy Prompt Matching ──────────────────────────────────────────────────
  public calculatePromptSimilarity(p1: string, p2: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !["the", "and", "for", "with", "diagram", "illustration"].includes(w));

    const words1 = new Set(normalize(p1));
    const words2 = new Set(normalize(p2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const w of words1) {
      if (words2.has(w)) intersection++;
    }

    const union = new Set([...words1, ...words2]).size;
    return union === 0 ? 0 : intersection / union;
  }

  public async findFuzzyDuplicate(prompt: string, userId?: string): Promise<any | null> {
    if (!prompt || !userId || mongoose.connection.readyState !== 1) return null;

    try {
      const candidates = await Asset.find({
        del_flag: 0,
        type: "ai",
        $or: [{ createdBy: userId }, { ownerId: userId }],
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      for (const item of candidates) {
        if (!item.prompt) continue;
        const sim = this.calculatePromptSimilarity(prompt, item.prompt);
        if (sim >= 0.85) {
          return item;
        }
      }
    } catch (err: any) {
      console.warn("[ImageGenerationService] Fuzzy duplicate check failed:", err.message);
    }

    return null;
  }

  // ─── Cloudinary Upload Helper ───────────────────────────────────────────────
  private async uploadToCloudinary(
    buffer: Buffer,
    baseName: string,
    userId: string
  ): Promise<{ url: string; thumbnailUrl: string }> {
    const folder = `media-library/${userId || "shared"}/ai-illustrations`;
    const ts = Date.now();
    const publicId = `${baseName}_${ts}`;

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const result = await new Promise<any>((resolve, reject) => {
          (cloudinary as any).uploader
            .upload_stream(
              {
                folder,
                public_id: publicId,
                resource_type: "image",
              },
              (err: any, res: any) => {
                if (err) reject(err);
                else resolve(res);
              }
            )
            .end(buffer);
        });

        if (result && result.secure_url) {
          const thumbUrl = result.secure_url.replace(
            "/upload/",
            "/upload/c_thumb,w_400,h_225,g_center/"
          );
          return {
            url: result.secure_url,
            thumbnailUrl: thumbUrl,
          };
        }
      } catch (err: any) {
        console.warn("[ImageGenerationService] Cloudinary upload error, using fallback URL:", err.message);
      }
    }

    // Fallback: Data URL or simulated asset URL for test/offline runtime
    const base64 = buffer.toString("base64");
    const mime = "image/png";
    const dataUrl = `data:${mime};base64,${base64}`;
    return {
      url: dataUrl,
      thumbnailUrl: dataUrl,
    };
  }

  // ─── Core Generation Flow with Cost Protection & Telemetry ──────────────────
  public async generateTechnicalIllustration(
    options: GenerateTechnicalIllustrationOptions
  ): Promise<any> {
    const {
      prompt,
      style = "isometric",
      aspectRatio = "16:9",
      seed: inputSeed,
      userId,
      suggestionId,
      force,
      signal,
    } = options;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Prompt is required for illustration generation.");
    }

    const cleanPrompt = prompt.trim();
    if (cleanPrompt.length < 3 || cleanPrompt.length > 1000) {
      throw new Error("Prompt length must be between 3 and 1000 characters.");
    }

    const normalizedStyle = this.normalizeStyle(style);
    const validSeed = inputSeed ?? Math.floor(Math.random() * 1_000_000);

    // 1. Cost Protection: Check Rate Limits
    this.checkRateLimit(userId);

    // 2. Cost Protection: In-flight duplicate request prevention (Idempotency)
    const inFlightKey = `${userId || "anon"}:${cleanPrompt.toLowerCase()}:${normalizedStyle}:${aspectRatio}`;
    if (!force && this.inFlightRequests.has(inFlightKey)) {
      return this.inFlightRequests.get(inFlightKey)!;
    }

    // Wrap execution in an in-flight promise immediately so concurrent calls coalesce
    const generationPromise = (async () => {
      // 3. Check for fuzzy duplicate in Asset library unless force=true
      if (!force) {
        const duplicate = await this.findFuzzyDuplicate(cleanPrompt, userId);
        if (duplicate) {
          return {
            ...duplicate,
            isReused: true,
          };
        }
      }

      const startTime = Date.now();
      const activeGenerator: ImageGenerator = imageGeneratorRegistry.getActive();

      // Telemetry: image_generation_started
      this.recordTelemetry({
        event: "image_generation_started",
        provider: activeGenerator.id,
        model: activeGenerator.id,
        userId,
        timestamp: new Date(),
        metadata: { prompt: cleanPrompt, style: normalizedStyle, aspectRatio },
      });

      try {
        // Enhance prompt with style preset instructions
        const enhancedPrompt = this.enhancePromptWithPreset(cleanPrompt, normalizedStyle);

        // Execute provider generation with 1 transient retry policy
        let result: any;
        let attempts = 0;
        const maxAttempts = 2; // initial attempt + 1 transient retry

        while (attempts < maxAttempts) {
          attempts++;
          try {
            result = await activeGenerator.generate({
              prompt: enhancedPrompt,
              style: normalizedStyle,
              aspectRatio,
              seed: validSeed,
              userId,
              suggestionId,
              signal,
            });
            break; // Success
          } catch (genErr: any) {
            const isTransient =
              genErr?.code === "ECONNRESET" ||
              genErr?.code === "ETIMEDOUT" ||
              genErr?.response?.status === 503 ||
              genErr?.response?.status === 429;

            if (attempts < maxAttempts && isTransient) {
              console.warn(`[ImageGenerationService] Transient provider error (${genErr.message}), retrying once...`);
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            throw genErr;
          }
        }

        const latency = Date.now() - startTime;
        const fileHash = crypto.createHash("sha256").update(result.buffer).digest("hex");

        const baseNameRaw = cleanPrompt
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .substring(0, 40);
        const baseName = `ai_illu_${baseNameRaw}`;

        const effectiveUserId = userId || new mongoose.Types.ObjectId().toString();
        const { url, thumbnailUrl } = await this.uploadToCloudinary(result.buffer, baseName, effectiveUserId);

        const assetId = new mongoose.Types.ObjectId();
        const assetData = {
          _id: assetId,
          ownerId: effectiveUserId,
          createdBy: effectiveUserId,
          filename: `${baseName}.png`,
          originalName: cleanPrompt,
          mimeType: result.mimeType || "image/png",
          hash: fileHash,
          url,
          thumbnailUrl,
          size: result.buffer.length,
          width: 1200,
          height: 675,
          type: "ai",
          source: "ai_generated",
          sourceType: "ai",
          provider: activeGenerator.id,
          prompt: cleanPrompt,
          model: result.model,
          seed: result.seed,
          style: normalizedStyle,
          aspectRatio,
          suggestionId: suggestionId || "",
          searchQuery: cleanPrompt,
          alt: `${cleanPrompt} (${normalizedStyle} technical illustration)`,
          description: `AI Technical Illustration: ${cleanPrompt}\nPreset: ${normalizedStyle}\nModel: ${result.model}`,
          tags: ["ai", "technical-illustration", normalizedStyle],
        };

        let savedAsset = assetData;
        if (mongoose.connection.readyState === 1) {
          try {
            const created = await Asset.create(assetData);
            savedAsset = created.toObject();

            // Sync to MediaAsset
            try {
              await MediaAsset.create({
                _id: assetId,
                user: effectiveUserId,
                originalFilename: `${baseName}.png`,
                mimeType: result.mimeType || "image/png",
                fileHash,
                type: "image",
                urls: {
                  original: url,
                  thumbnail_md: thumbnailUrl,
                  thumbnail_sm: thumbnailUrl,
                },
                dimensions: { width: 1200, height: 675 },
                fileSize: result.buffer.length,
                provider: "cloudinary",
                altText: assetData.alt,
                description: assetData.description,
                tags: assetData.tags,
                aiMetadata: {
                  prompt: cleanPrompt,
                  model: result.model,
                  generatedAt: new Date(),
                },
              });
            } catch (mErr: any) {
              // Silently ignore MediaAsset sync warnings in test/offline
            }
          } catch (dbErr: any) {
            console.warn("[ImageGenerationService] Asset DB persistence fallback:", dbErr.message);
          }
        }

        // Telemetry: image_generation_completed
        this.recordTelemetry({
          event: "image_generation_completed",
          provider: activeGenerator.id,
          model: result.model,
          latency,
          userId,
          assetId: assetId.toString(),
          timestamp: new Date(),
        });

        // If this was a forced regeneration, also record image_generation_regenerated
        if (force) {
          this.recordTelemetry({
            event: "image_generation_regenerated",
            provider: activeGenerator.id,
            model: result.model,
            latency,
            userId,
            assetId: assetId.toString(),
            timestamp: new Date(),
          });
        }

        return savedAsset;
      } catch (error: any) {
        const latency = Date.now() - startTime;
        // Telemetry: image_generation_failed
        this.recordTelemetry({
          event: "image_generation_failed",
          provider: activeGenerator.id,
          model: activeGenerator.id,
          latency,
          userId,
          timestamp: new Date(),
          metadata: { error: error.message },
        });

        throw error;
      } finally {
        this.inFlightRequests.delete(inFlightKey);
      }
    })();

    this.inFlightRequests.set(inFlightKey, generationPromise);
    return generationPromise;
  }
}

export const imageGenerationService = new ImageGenerationService();
