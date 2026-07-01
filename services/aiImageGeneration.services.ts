// =============================================================================
//  AI IMAGE GENERATION ORCHESTRATION SERVICE
//  services/aiImageGeneration.services.ts
//
//  Workflow:
//    1. Receive a text prompt + options from the controller
//    2. Call the active image generation provider
//    3. Process each image with Sharp (optimise + create thumbnails)
//    4. Upload all variants to Cloudinary
//    5. Persist a MediaAsset document (provider = "ai-generated")
//    6. Enqueue a background AI metadata analysis job
//    7. Return the saved MediaAsset(s)
//
//  Design decisions:
//  - This service never imports from ai/provider/ directly; it uses the
//    ai/image-generation/ abstraction layer.
//  - Cloudinary and Sharp logic is delegated to the same helpers used in
//    mediaAsset.services.js to stay DRY.
//  - Each generated image becomes an independent MediaAsset so it is
//    searchable, reusable, and de-duplicatable like any other asset.
//  - prompt and generatedBy are stored in aiMetadata for provenance tracking.
// =============================================================================

import crypto from "crypto";
import sharp from "sharp";
import mongoose from "mongoose";
import cloudinary from "../utils/cloudinary";
import { aiImageGenerationService, type ImageGenerationRequest } from "../ai/image-generation";

// These are CommonJS modules — lazy-required to avoid circular import issues
const getModels = () => require("../models");
const getAiQueue = () => require("./aiQueue.services");

// ─── Sharp processing helper ──────────────────────────────────────────────────

async function processImageBuffer(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  const dimensions = { width: meta.width!, height: meta.height! };

  const [webpBuffer, thumbSm, thumbMd, thumbLg] = await Promise.all([
    sharp(buffer).resize(2000, null, { withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer(),
    sharp(buffer).resize(150, 150, { fit: "cover", position: "attention" }).webp({ quality: 75 }).toBuffer(),
    sharp(buffer).resize(400, null, { withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    sharp(buffer).resize(800, null, { withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
  ]);

  return { original: buffer, webpBuffer, thumbSm, thumbMd, thumbLg, dimensions };
}

// ─── Cloudinary upload helper ─────────────────────────────────────────────────

function uploadToCloudinary(buffer: Buffer, folder: string, publicId: string, extraOpts = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    (cloudinary as any).uploader
      .upload_stream(
        { folder, public_id: publicId, resource_type: "image", format: "webp", ...extraOpts },
        (error: any, result: any) => {
          if (result) resolve(result);
          else reject(error);
        }
      )
      .end(buffer);
  });
}

async function uploadAllVariants(userId: string, processed: any, baseName: string) {
  const folder = `media-library/${userId}/ai-generated`;
  const ts = Date.now();

  const [originalResult, webpResult, smResult, mdResult, lgResult] = await Promise.all([
    new Promise<any>((resolve, reject) => {
      (cloudinary as any).uploader
        .upload_stream(
          { folder, public_id: `${baseName}_original_${ts}`, resource_type: "image" },
          (error: any, result: any) => { if (result) resolve(result); else reject(error); }
        )
        .end(processed.original);
    }),
    uploadToCloudinary(processed.webpBuffer, folder, `${baseName}_webp_${ts}`),
    uploadToCloudinary(processed.thumbSm,    folder, `${baseName}_sm_${ts}`),
    uploadToCloudinary(processed.thumbMd,    folder, `${baseName}_md_${ts}`),
    uploadToCloudinary(processed.thumbLg,    folder, `${baseName}_lg_${ts}`),
  ]);

  return {
    original:     originalResult.secure_url,
    webp:         webpResult.secure_url,
    thumbnail_sm: smResult.secure_url,
    thumbnail_md: mdResult.secure_url,
    thumbnail_lg: lgResult.secure_url,
    _publicId:    originalResult.public_id,
  };
}

// =============================================================================
//  AIImageGenerationOrchestratorService
// =============================================================================

export interface GenerateAndSaveOptions {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: ImageGenerationRequest["aspectRatio"];
  style?: ImageGenerationRequest["style"];
  count?: number;
  providerId?: string;
  folderId?: string | null;
  signal?: AbortSignal;
}

export interface GenerateAndSaveResult {
  assets: any[]; // MediaAsset documents
  providerId: string;
  revisedPrompts: (string | undefined)[];
}

class AIImageGenerationOrchestratorService {
  /**
   * Full workflow: generate → process → CDN → persist → enqueue AI analysis.
   */
  async generateAndSave(
    userId: string,
    options: GenerateAndSaveOptions
  ): Promise<GenerateAndSaveResult> {
    const {
      prompt,
      negativePrompt,
      aspectRatio = "1:1",
      style = "photorealistic",
      count = 1,
      providerId,
      folderId = null,
      signal,
    } = options;

    // ── 1. Generate ──────────────────────────────────────────────────────────
    const genRequest: ImageGenerationRequest = {
      prompt,
      negativePrompt,
      aspectRatio,
      style,
      count: Math.min(count, 4),
      signal,
    };

    const result = providerId
      ? await aiImageGenerationService.generateWith(providerId, genRequest)
      : await aiImageGenerationService.generate(genRequest);

    const usedProviderId = providerId ?? aiImageGenerationService.registry.getActive().id;
    const { MediaAsset } = getModels();
    const aiQueueService = getAiQueue();

    const savedAssets: any[] = [];
    const revisedPrompts: (string | undefined)[] = [];

    // ── 2. For each generated image ──────────────────────────────────────────
    for (let i = 0; i < result.images.length; i++) {
      const img = result.images[i];

      // 2a. Compute SHA-256 hash for deduplication
      const fileHash = crypto.createHash("sha256").update(img.buffer).digest("hex");

      // 2b. Check for exact duplicate
      const existing = await MediaAsset.findOne({ user: userId, fileHash, del_flag: 0 });
      if (existing) {
        savedAssets.push(existing);
        revisedPrompts.push(img.revisedPrompt);
        continue;
      }

      // 2c. Process with Sharp
      const processed = await processImageBuffer(img.buffer);

      // 2d. Build a safe base filename from the prompt
      const baseNameRaw = prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .substring(0, 50);
      const baseName = `ai_${baseNameRaw}_${i}`;

      // 2e. Upload all variants to Cloudinary
      const urls = await uploadAllVariants(userId, processed, baseName);

      // 2f. Persist MediaAsset
      const media = new MediaAsset({
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        originalFilename: `${baseName}.png`,
        mimeType: img.mimeType,
        fileHash,
        type: "image",
        urls: {
          original:     urls.original,
          webp:         urls.webp,
          thumbnail_sm: urls.thumbnail_sm,
          thumbnail_md: urls.thumbnail_md,
          thumbnail_lg: urls.thumbnail_lg,
        },
        dimensions:    processed.dimensions,
        fileSize:      img.buffer.length,
        fileSizeWebp:  processed.webpBuffer?.length ?? null,
        provider:      "cloudinary",
        providerAssetId: urls._publicId,
        // Seed metadata with prompt for immediate usability before AI analysis
        altText:       `AI-generated: ${prompt.substring(0, 100)}`,
        description:   `AI-generated image.\nPrompt: ${img.revisedPrompt ?? prompt}\nProvider: ${usedProviderId}`,
        tags:          ["ai-generated", style, ...(aspectRatio !== "1:1" ? [aspectRatio.replace(":", "x")] : [])],
        folder:        folderId,
        userEditedFields: [], // AI metadata analysis will enrich all fields
        // Store generation provenance in aiMetadata
        aiMetadata: {
          generatedAt: new Date().toISOString(),
          model: usedProviderId,
          prompt:        img.revisedPrompt ?? prompt,
          negativePrompt: negativePrompt ?? null,
        },
      });

      await media.save();

      // 2g. Enqueue background AI analysis (vision → alt, description, tags)
      try {
        await aiQueueService.enqueue(media._id, userId);
      } catch (err: any) {
        console.error("[AIImageGenerationService] Failed to enqueue AI analysis job:", err.message);
      }

      savedAssets.push(media);
      revisedPrompts.push(img.revisedPrompt);
    }

    return {
      assets: savedAssets,
      providerId: usedProviderId,
      revisedPrompts,
    };
  }

  /**
   * Returns available providers metadata for the capability endpoint.
   */
  getProviders() {
    return aiImageGenerationService.getProviderMetadata();
  }
}

export const aiImageGenerationOrchestratorService = new AIImageGenerationOrchestratorService();
