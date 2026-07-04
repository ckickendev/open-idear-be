// =============================================================================
//  AI IMAGE EDITING ORCHESTRATION SERVICE
//  services/aiImageEditing.services.ts
//
//  Workflow:
//    1. Load source MediaAsset from DB (validate ownership)
//    2. Download source image from Cloudinary URL
//    3. Dispatch to the appropriate edit provider (Sharp or Gemini)
//    4. Process result with Sharp (optimize + thumbnails)
//    5. Upload all variants to Cloudinary as new files
//    6. Persist a NEW MediaAsset document — NEVER touch the original
//    7. Enqueue background AI metadata analysis job
//    8. Return the new MediaAsset
//
//  IMMUTABILITY GUARANTEE:
//  The original MediaAsset document and its Cloudinary files are never
//  modified. Every edit produces a completely independent new asset.
// =============================================================================

import crypto from "crypto";
import sharp from "sharp";
import mongoose from "mongoose";
import axios from "axios";
import cloudinary from "../utils/cloudinary";
import {
  aiImageEditService,
  type EditOperation,
  type ImageEditParams,
} from "../ai/image-editing";

// Lazy require to avoid circular imports
const getModels = () => require("../models");
const getAiQueue = () => require("./aiQueue.services");

// ─── Sharp processing (reused from upload pipeline) ───────────────────────────

async function processBuffer(buffer: Buffer) {
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

// ─── Cloudinary helpers ───────────────────────────────────────────────────────

function uploadStream(buffer: Buffer, folder: string, publicId: string, opts = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    (cloudinary as any).uploader
      .upload_stream(
        { folder, public_id: publicId, resource_type: "image", format: "webp", ...opts },
        (err: any, result: any) => { if (result) resolve(result); else reject(err); }
      )
      .end(buffer);
  });
}

async function uploadAllVariants(userId: string, processed: any, baseName: string) {
  const folder = `media-library/${userId}/ai-edited`;
  const ts = Date.now();

  const [origResult, webpResult, smResult, mdResult, lgResult] = await Promise.all([
    new Promise<any>((resolve, reject) => {
      (cloudinary as any).uploader
        .upload_stream(
          { folder, public_id: `${baseName}_orig_${ts}`, resource_type: "image" },
          (err: any, r: any) => { if (r) resolve(r); else reject(err); }
        )
        .end(processed.original);
    }),
    uploadStream(processed.webpBuffer, folder, `${baseName}_webp_${ts}`),
    uploadStream(processed.thumbSm,    folder, `${baseName}_sm_${ts}`),
    uploadStream(processed.thumbMd,    folder, `${baseName}_md_${ts}`),
    uploadStream(processed.thumbLg,    folder, `${baseName}_lg_${ts}`),
  ]);

  return {
    original:     origResult.secure_url,
    webp:         webpResult.secure_url,
    thumbnail_sm: smResult.secure_url,
    thumbnail_md: mdResult.secure_url,
    thumbnail_lg: lgResult.secure_url,
    _publicId:    origResult.public_id,
  };
}

// =============================================================================
//  AIImageEditingOrchestratorService
// =============================================================================

export interface EditAndSaveOptions {
  sourceMediaId: string;
  params: ImageEditParams;
  signal?: AbortSignal;
}

export interface EditAndSaveResult {
  asset: any; // new MediaAsset document
  operation: EditOperation;
  summary: string;
  sourceMediaId: string;
}

class AIImageEditingOrchestratorService {
  async editAndSave(
    userId: string,
    options: EditAndSaveOptions
  ): Promise<EditAndSaveResult> {
    const { sourceMediaId, params, signal } = options;
    const { MediaAsset } = getModels();

    // ── 1. Load & authorize source asset ─────────────────────────────────────
    const sourceAsset = await MediaAsset.findOne({
      _id: sourceMediaId,
      user: userId,
      del_flag: 0,
    });

    if (!sourceAsset) {
      throw new Error(`Source media asset "${sourceMediaId}" not found or access denied.`);
    }

    if (sourceAsset.type !== "image") {
      throw new Error("Only image assets can be edited.");
    }

    // ── 2. Download source image ──────────────────────────────────────────────
    const sourceUrl: string = sourceAsset.urls?.original || sourceAsset.urls?.webp;
    if (!sourceUrl) {
      throw new Error("Source asset has no downloadable URL.");
    }

    const downloadResponse = await axios.get(sourceUrl, {
      responseType: "arraybuffer",
      timeout: 30_000,
      signal: signal as any,
    });
    const sourceBuffer = Buffer.from(downloadResponse.data);
    const sourceMimeType: string = downloadResponse.headers["content-type"] || "image/jpeg";

    // ── 3. Edit ───────────────────────────────────────────────────────────────
    const editResult = await aiImageEditService.edit({
      sourceBuffer,
      sourceMimeType,
      params,
      signal,
    });

    // ── 4. Process with Sharp ─────────────────────────────────────────────────
    const processed = await processBuffer(editResult.resultBuffer);

    // ── 5. Build filename ─────────────────────────────────────────────────────
    const sourceName = (sourceAsset.originalFilename as string)
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]/gi, "_")
      .substring(0, 40);
    const baseName = `${sourceName}_${params.operation}_edited`;

    // ── 6. Upload to Cloudinary ───────────────────────────────────────────────
    const urls = await uploadAllVariants(userId, processed, baseName);

    // ── 7. Compute file hash ──────────────────────────────────────────────────
    const fileHash = crypto
      .createHash("sha256")
      .update(editResult.resultBuffer)
      .digest("hex");

    // ── 8. Persist NEW MediaAsset ─────────────────────────────────────────────
    const opLabel: Record<EditOperation, string> = {
      "remove-background": "BG Removed",
      "upscale":           `${(params as any).factor ?? 2}× Upscaled`,
      "crop":              "Cropped",
      "expand":            "Expanded",
      "replace-object":    "Object Replaced",
      "change-style":      `Style: ${(params as any).preset ?? "custom"}`,
    };

    const newAsset = new MediaAsset({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      originalFilename: `${baseName}.png`,
      mimeType: editResult.resultMimeType,
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
      fileSize:      editResult.resultBuffer.length,
      fileSizeWebp:  processed.webpBuffer?.length ?? null,
      provider:      "cloudinary",
      providerAssetId: urls._publicId,
      altText:       `${opLabel[params.operation]} — ${sourceAsset.altText || sourceAsset.originalFilename}`,
      description:   [
        editResult.summary,
        `Original asset: ${sourceMediaId}`,
        `Operation: ${params.operation}`,
      ].join("\n"),
      tags: [
        "ai-edited",
        params.operation,
        ...(sourceAsset.tags?.slice(0, 5) ?? []),
      ],
      folder: sourceAsset.folder ?? null,
      userEditedFields: [],
      // Store editing provenance
      aiMetadata: {
        generatedAt:      new Date().toISOString(),
        model:            "gemini-imagen-edit",
        editedFrom:       sourceMediaId,
        editOperation:    params.operation,
        editSummary:      editResult.summary,
      },
    });

    await newAsset.save();

    // ── 9. Enqueue background AI analysis ─────────────────────────────────────
    try {
      const aiQueue = getAiQueue();
      await aiQueue.enqueue(newAsset._id, userId);
    } catch (err: any) {
      console.error("[AIImageEditingService] Failed to enqueue AI analysis:", err.message);
    }

    console.log(
      `[AIImageEditingService] Created new asset "${newAsset._id}" ` +
      `from edit of "${sourceMediaId}" (op: ${params.operation})`
    );

    return {
      asset: newAsset,
      operation: params.operation,
      summary: editResult.summary,
      sourceMediaId,
    };
  }
}

export const aiImageEditingOrchestratorService = new AIImageEditingOrchestratorService();
