// =============================================================================
//  IMAGE IMPORT SERVICE (SPRINT 2)
//  services/imageImport.service.ts
//
//  Workflow:
//    External URL → Duplicate check (sourceUrl) → Download → Hash check
//    → Cloudinary upload → Asset record creation → Return Asset
//
//  Design Decisions:
//  - SSRF Protection: only downloads from whitelisted image domains.
//  - Duplicate-by-sourceUrl: avoids re-importing the same stock photo.
//  - Duplicate-by-hash: avoids storing identical image bytes twice.
//  - Stores all provider provenance fields: author, license, attributionUrl.
//  - Articles reference an Asset _id rather than raw external URLs.
// =============================================================================

import crypto from "crypto";
import { URL as NodeURL } from "url";
import mongoose from "mongoose";
import cloudinary from "../utils/cloudinary";

const Asset = require("../models/asset.schema");

// ─── SSRF Allowlist ────────────────────────────────────────────────────────────
const ALLOWED_IMAGE_DOMAINS = new Set([
  "images.unsplash.com",
  "plus.unsplash.com",
  "images.pexels.com",
  "cdn.pixabay.com",
  "pixabay.com",
  "img.freepik.com",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
]);

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
const DOWNLOAD_TIMEOUT_MS = 15_000;

export interface ImageImportOptions {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  alt?: string;
  author?: string;
  license?: string;
  attributionUrl?: string;
  sourceProvider?: string;
  sourceUrl?: string;
  searchQuery?: string;
  userId: string;
}

export interface ImportedAsset {
  _id: string;
  url: string;
  thumbnailUrl: string;
  alt: string;
  source: string;
  sourceProvider?: string;
  sourceUrl?: string;
  author?: string;
  license?: string;
  attributionUrl?: string;
  isExisting?: boolean;
  isExternalReference?: boolean;
  assetType?: "external_reference" | "downloaded" | "ai_generated";
}

export class ImageImportService {
  /**
   * Validates that the URL's hostname is in the SSRF allowlist.
   */
  validateUrl(rawUrl: string): { valid: boolean; reason?: string } {
    try {
      const parsed = new NodeURL(rawUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { valid: false, reason: "Only http/https URLs are allowed." };
      }
      if (!ALLOWED_IMAGE_DOMAINS.has(parsed.hostname)) {
        return {
          valid: false,
          reason: `Image host "${parsed.hostname}" is not in the allowed provider list.`,
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: "Invalid URL format." };
    }
  }

  /**
   * Downloads an image buffer from a validated external URL.
   * Enforces size limit, timeout, MIME type, and image magic bytes.
   */
  private async downloadBuffer(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} downloading image`);
      }

      // 1. Content-Type Header Verification
      const contentType = response.headers.get("content-type");
      if (
        contentType &&
        !contentType.startsWith("image/") &&
        !contentType.includes("octet-stream")
      ) {
        throw new Error(`Invalid content type "${contentType}". Only image files are permitted.`);
      }

      // 2. Content-Length Limit Verification
      const contentLength = Number(response.headers.get("content-length"));
      if (contentLength && contentLength > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Image exceeds size limit of ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB`);
      }

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Image exceeds size limit of ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB`);
      }

      const buffer = Buffer.from(arrayBuf);

      // 3. Image Magic Bytes Signature Verification
      const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isGif = buffer.length > 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
      const isWebp = buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
      const isSvg = buffer.subarray(0, 300).toString().toLowerCase().includes("<svg");

      if (!isJpeg && !isPng && !isGif && !isWebp && !isSvg) {
        throw new Error("Downloaded file does not match expected image signatures (JPEG, PNG, GIF, WebP, SVG).");
      }

      return buffer;
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new Error("Image download timed out");
      }
      throw err;
    }
  }

  /**
   * Uploads an image buffer to Cloudinary.
   */
  private async uploadToCloudinary(
    buffer: Buffer,
    publicId: string,
    folder: string
  ): Promise<{ url: string; thumbnailUrl: string }> {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const result = await new Promise<any>((resolve, reject) => {
          (cloudinary as any).uploader
            .upload_stream(
              { folder, public_id: publicId, resource_type: "image" },
              (err: any, res: any) => {
                if (err) reject(err);
                else resolve(res);
              }
            )
            .end(buffer);
        });

        if (result?.secure_url) {
          const thumbUrl = result.secure_url.replace(
            "/upload/",
            "/upload/c_fill,w_400,h_250,g_auto/"
          );
          return { url: result.secure_url, thumbnailUrl: thumbUrl };
        }
      } catch (err: any) {
        console.warn("[ImageImportService] Cloudinary upload failed:", err.message);
      }
    }

    // Fallback: return original external URL
    return { url: "", thumbnailUrl: "" };
  }

  /**
   * Main entry point. Imports a stock image into the Asset Library.
   * If network fails or download fails, gracefully returns an external reference asset.
   */
  async importFromExternalUrl(options: ImageImportOptions): Promise<ImportedAsset> {
    const {
      url,
      thumbnailUrl,
      title = "",
      alt = "",
      author = "",
      license = "",
      attributionUrl = "",
      sourceProvider = "",
      sourceUrl = url,
      searchQuery = "",
      userId,
    } = options;

    // 1. SSRF Validation
    const urlCheck = this.validateUrl(url);
    if (!urlCheck.valid) {
      throw new Error(`[ImageImportService] URL rejected: ${urlCheck.reason}`);
    }

    // 2. Duplicate check by sourceUrl (same stock photo already imported)
    if (sourceUrl && mongoose.connection.readyState === 1) {
      try {
        const existingBySource = await Asset.findOne({
          sourceProvider: sourceProvider || { $exists: false },
          sourceUrl,
          del_flag: 0,
          $or: [{ ownerId: userId }, { createdBy: userId }],
        }).lean();

        if (existingBySource) {
          return {
            _id: existingBySource._id.toString(),
            url: existingBySource.url,
            thumbnailUrl: existingBySource.thumbnailUrl || existingBySource.url,
            alt: existingBySource.alt || alt,
            source: existingBySource.source,
            sourceProvider: existingBySource.sourceProvider,
            sourceUrl: existingBySource.sourceUrl,
            author: existingBySource.author,
            license: existingBySource.license,
            attributionUrl: existingBySource.attributionUrl,
            isExisting: true,
            isExternalReference: existingBySource.source === "stock" && !existingBySource.url.includes("cloudinary"),
            assetType: existingBySource.url.includes("cloudinary") ? "downloaded" : "external_reference",
          };
        }
      } catch (err: any) {
        console.warn("[ImageImportService] Source dedup check failed:", err.message);
      }
    }

    // 3. Download image buffer (with graceful offline fallback)
    let buffer: Buffer | null = null;
    try {
      buffer = await this.downloadBuffer(url);
    } catch (err: any) {
      console.warn(`[ImageImportService] Download skipped/failed: ${err.message}. Retaining as external reference asset.`);
    }

    // If download buffer is unavailable (e.g. offline, timeout, network failure),
    // return external image reference asset so author's workflow is not interrupted.
    if (!buffer) {
      return {
        _id: "ext_" + Date.now(),
        url,
        thumbnailUrl: thumbnailUrl || url,
        alt: alt || title || "Stock Photo",
        source: "stock",
        sourceProvider,
        sourceUrl,
        author,
        license,
        attributionUrl,
        isExisting: false,
        isExternalReference: true,
        assetType: "external_reference",
      };
    }

    // 4. Compute file hash
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    // 5. Duplicate check by hash
    if (mongoose.connection.readyState === 1) {
      try {
        const existingByHash = await Asset.findOne({
          hash: fileHash,
          del_flag: 0,
          $or: [{ ownerId: userId }, { createdBy: userId }],
        }).lean();

        if (existingByHash) {
          return {
            _id: existingByHash._id.toString(),
            url: existingByHash.url,
            thumbnailUrl: existingByHash.thumbnailUrl || existingByHash.url,
            alt: existingByHash.alt || alt,
            source: existingByHash.source,
            sourceProvider: existingByHash.sourceProvider,
            sourceUrl: existingByHash.sourceUrl,
            author: existingByHash.author,
            license: existingByHash.license,
            attributionUrl: existingByHash.attributionUrl,
            isExisting: true,
          };
        }
      } catch (err: any) {
        console.warn("[ImageImportService] Hash dedup check failed:", err.message);
      }
    }

    // 6. Upload to Cloudinary
    const safeTitle = (title || alt || "stock-import")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .substring(0, 40);
    const publicId = `stock_${safeTitle}_${Date.now()}`;
    const folder = `media-library/${userId}/stock-imports`;

    const { url: cdnUrl, thumbnailUrl: cdnThumb } = await this.uploadToCloudinary(
      buffer,
      publicId,
      folder
    );

    // Use Cloudinary URL if available, otherwise fall back to original URL
    const finalUrl = cdnUrl || url;
    const finalThumb = cdnThumb || thumbnailUrl || url;

    // 7. Persist Asset record
    const assetId = new mongoose.Types.ObjectId();
    const assetData: any = {
      _id: assetId,
      ownerId: userId,
      createdBy: userId,
      filename: `${publicId}.jpg`,
      originalName: title || alt || "stock-import",
      mimeType: "image/jpeg",
      hash: fileHash,
      url: finalUrl,
      thumbnailUrl: finalThumb,
      size: buffer.length,
      width: 1200,
      height: 800,
      type: "image",
      source: "stock",
      alt: alt || title || "",
      description: `Stock image from ${sourceProvider || "external provider"}. ${author ? `By ${author}.` : ""}`,
      tags: [sourceProvider, "stock", "imported"].filter(Boolean),
      searchQuery: searchQuery || "",
      // Provider provenance
      sourceProvider,
      sourceUrl,
      author,
      license,
      attributionUrl,
    };

    if (mongoose.connection.readyState === 1) {
      try {
        const saved = await Asset.create(assetData);
        return {
          _id: saved._id.toString(),
          url: saved.url,
          thumbnailUrl: saved.thumbnailUrl,
          alt: saved.alt,
          source: saved.source,
          sourceProvider: saved.sourceProvider,
          sourceUrl: saved.sourceUrl,
          author: saved.author,
          license: saved.license,
          attributionUrl: saved.attributionUrl,
          isExisting: false,
        };
      } catch (err: any) {
        console.warn("[ImageImportService] Asset persistence failed:", err.message);
      }
    }

    // Offline/test fallback
    return {
      _id: assetId.toString(),
      url: finalUrl,
      thumbnailUrl: finalThumb,
      alt: alt || title || "",
      source: "stock",
      sourceProvider,
      sourceUrl,
      author,
      license,
      attributionUrl,
      isExisting: false,
    };
  }
}

export const imageImportService = new ImageImportService();
