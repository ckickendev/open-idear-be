const crypto = require("crypto");
const sharp = require("sharp");
const PQueue = require("p-queue");
const { Service } = require("../core");
const { MediaAsset, MediaFolder, Post } = require("../models");
const cloudinary = require("../utils/cloudinary");
const mongoose = require("mongoose");

// Limit concurrent sharp operations to prevent OOM under load
const imageQueue = new PQueue.default
  ? new (PQueue.default)({ concurrency: 4 })
  : new PQueue({ concurrency: 4 });

// Grid-view projection — only send what the grid needs
const GRID_PROJECTION = {
  _id: 1,
  originalFilename: 1,
  mimeType: 1,
  type: 1,
  "urls.thumbnail_sm": 1,
  "urls.thumbnail_md": 1,
  "urls.webp": 1,
  dimensions: 1,
  fileSize: 1,
  isFavorite: 1,
  tags: 1,
  folder: 1,
  altText: 1,
  usageCount: 1,
  createdAt: 1,
};

class MediaAssetService extends Service {
  // ═══════════════════════════════════════════════════════════════════
  //  UPLOAD PIPELINE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Full upload pipeline: hash → dedup check → process → CDN → save.
   * Returns { isDuplicate: boolean, media: MediaAsset }.
   */
  async uploadImage(userId, file, options = {}) {
    const { folderId = null, description = "", altText = "" } = options;

    // Step 1: Compute SHA-256 hash from raw buffer
    const fileHash = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");

    // Step 2: Deduplication check
    const existing = await MediaAsset.findOne({
      user: userId,
      fileHash,
      del_flag: 0,
    });

    if (existing) {
      return { isDuplicate: true, media: existing };
    }

    // Step 3: Process image with sharp (queued to limit concurrency)
    const processed = await imageQueue.add(() =>
      this._processImage(file.buffer)
    );

    // Step 4: Upload all variants to Cloudinary
    const urls = await this._uploadVariants(
      userId,
      processed,
      file.originalname
    );

    // Step 5: Persist to MongoDB
    const media = new MediaAsset({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      originalFilename: this._sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      fileHash,
      type: "image",
      urls: {
        original: urls.original,
        webp: urls.webp,
        thumbnail_sm: urls.thumbnail_sm,
        thumbnail_md: urls.thumbnail_md,
        thumbnail_lg: urls.thumbnail_lg,
      },
      dimensions: processed.dimensions,
      fileSize: file.buffer.length,
      fileSizeWebp: processed.webpBuffer?.length || null,
      provider: "cloudinary",
      providerAssetId: urls._publicId,
      altText,
      description,
      folder: folderId,
    });

    await media.save();

    // Step 6: Increment folder asset count if applicable
    if (folderId) {
      await MediaFolder.findByIdAndUpdate(folderId, {
        $inc: { assetCount: 1 },
      });
    }

    return { isDuplicate: false, media };
  }

  // ─── Image Processing ─────────────────────────────────────────────

  async _processImage(buffer) {
    const metadata = await sharp(buffer).metadata();
    const dimensions = { width: metadata.width, height: metadata.height };

    // Generate all variants in parallel
    const [webpBuffer, thumbSm, thumbMd, thumbLg] = await Promise.all([
      // WebP optimized — max 2000px wide, quality 80
      sharp(buffer)
        .resize(2000, null, { withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer(),

      // Small thumbnail: 150×150 attention-based cover crop
      sharp(buffer)
        .resize(150, 150, { fit: "cover", position: "attention" })
        .webp({ quality: 75 })
        .toBuffer(),

      // Medium thumbnail: 400px wide, maintain aspect
      sharp(buffer)
        .resize(400, null, { withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer(),

      // Large thumbnail: 800px wide, maintain aspect
      sharp(buffer)
        .resize(800, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    ]);

    return { original: buffer, webpBuffer, thumbSm, thumbMd, thumbLg, dimensions };
  }

  // ─── CDN Upload ───────────────────────────────────────────────────

  async _uploadVariants(userId, processed, originalName) {
    const baseName = originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 60);
    const folder = `media-library/${userId}`;
    const ts = Date.now();

    const uploadBuffer = (buffer, suffix, extraOpts = {}) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder,
              public_id: `${baseName}_${suffix}_${ts}`,
              resource_type: "image",
              format: "webp",
              ...extraOpts,
            },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          )
          .end(buffer);
      });
    };

    // Upload original (preserve source format)
    const originalResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            public_id: `${baseName}_original_${ts}`,
            resource_type: "image",
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        )
        .end(processed.original);
    });

    // Upload WebP + thumbnails in parallel
    const [webpResult, smResult, mdResult, lgResult] = await Promise.all([
      uploadBuffer(processed.webpBuffer, "webp"),
      uploadBuffer(processed.thumbSm, "sm"),
      uploadBuffer(processed.thumbMd, "md"),
      uploadBuffer(processed.thumbLg, "lg"),
    ]);

    return {
      original: originalResult.secure_url,
      webp: webpResult.secure_url,
      thumbnail_sm: smResult.secure_url,
      thumbnail_md: mdResult.secure_url,
      thumbnail_lg: lgResult.secure_url,
      _publicId: originalResult.public_id,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DUPLICATE CHECK
  // ═══════════════════════════════════════════════════════════════════

  async checkDuplicate(userId, fileHash) {
    const existing = await MediaAsset.findOne({
      user: userId,
      fileHash,
      del_flag: 0,
    }).select("_id urls originalFilename dimensions fileSize createdAt");

    return existing ? { exists: true, media: existing } : { exists: false };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BROWSE & SEARCH
  // ═══════════════════════════════════════════════════════════════════

  async getMediaByUser(userId, options = {}) {
    const {
      page = 1,
      limit = 30,
      sort = "-createdAt",
      folder = undefined,
      type = undefined,
      isFavorite = undefined,
      tag = undefined,
    } = options;

    const filter = { user: userId, del_flag: 0 };
    if (folder !== undefined) filter.folder = folder;
    if (type) filter.type = type;
    if (isFavorite !== undefined) filter.isFavorite = isFavorite;
    if (tag) filter.tags = tag;

    const skip = (page - 1) * limit;

    const [media, total] = await Promise.all([
      MediaAsset.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(GRID_PROJECTION)
        .lean(),
      MediaAsset.countDocuments(filter),
    ]);

    return {
      media,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + media.length < total,
      },
    };
  }

  async searchMedia(userId, query, options = {}) {
    const { page = 1, limit = 30 } = options;
    const skip = (page - 1) * limit;

    const filter = {
      user: userId,
      del_flag: 0,
      $text: { $search: query },
    };

    const [media, total] = await Promise.all([
      MediaAsset.find(filter, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .skip(skip)
        .limit(limit)
        .select(GRID_PROJECTION)
        .lean(),
      MediaAsset.countDocuments(filter),
    ]);

    return {
      media,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + media.length < total,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DETAIL & METADATA
  // ═══════════════════════════════════════════════════════════════════

  async getMediaById(userId, mediaId) {
    const media = await MediaAsset.findOne({
      _id: mediaId,
      user: userId,
      del_flag: 0,
    })
      .populate("folder", "name slug color")
      .lean();

    if (!media) throw new Error("Media not found or access denied");
    return media;
  }

  async updateMetadata(userId, mediaId, updates) {
    const allowed = ["altText", "description", "tags", "folder", "isFavorite"];
    const sanitized = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) sanitized[key] = updates[key];
    }

    // If moving between folders, update both folder counts
    if (sanitized.folder !== undefined) {
      const current = await MediaAsset.findOne({
        _id: mediaId,
        user: userId,
        del_flag: 0,
      }).select("folder");

      if (current && current.folder?.toString() !== sanitized.folder) {
        // Decrement old folder
        if (current.folder) {
          await MediaFolder.findByIdAndUpdate(current.folder, {
            $inc: { assetCount: -1 },
          });
        }
        // Increment new folder
        if (sanitized.folder) {
          await MediaFolder.findByIdAndUpdate(sanitized.folder, {
            $inc: { assetCount: 1 },
          });
        }
      }
    }

    const media = await MediaAsset.findOneAndUpdate(
      { _id: mediaId, user: userId, del_flag: 0 },
      { $set: sanitized },
      { new: true }
    );

    if (!media) throw new Error("Media not found or access denied");
    return media;
  }

  async saveAIMetadata(userId, mediaId, aiData) {
    const media = await MediaAsset.findOneAndUpdate(
      { _id: mediaId, user: userId, del_flag: 0 },
      {
        $set: {
          aiMetadata: {
            altText: aiData.altText,
            description: aiData.description,
            tags: aiData.tags,
            generatedAt: new Date(),
            model: aiData.model || "gemini-2.0-flash",
            confidence: aiData.confidence || null,
          },
        },
      },
      { new: true }
    );

    if (!media) throw new Error("Media not found or access denied");
    return media;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  USAGE TRACKING
  // ═══════════════════════════════════════════════════════════════════

  async addUsage(mediaId, entityType, entityId, field) {
    await MediaAsset.updateOne(
      { _id: mediaId },
      {
        $addToSet: { usedIn: { entityType, entityId, field } },
        $inc: { usageCount: 1 },
      }
    );
  }

  async removeUsage(mediaId, entityType, entityId) {
    await MediaAsset.updateOne(
      { _id: mediaId },
      {
        $pull: { usedIn: { entityType, entityId } },
        $inc: { usageCount: -1 },
      }
    );
    // Prevent negative counts
    await MediaAsset.updateOne(
      { _id: mediaId, usageCount: { $lt: 0 } },
      { $set: { usageCount: 0 } }
    );
  }

  async getUsage(mediaId, userId) {
    const media = await MediaAsset.findOne(
      { _id: mediaId, user: userId, del_flag: 0 },
      { usedIn: 1, usageCount: 1 }
    ).lean();

    if (!media) throw new Error("Media not found");

    // Populate post titles for the usage list
    const postIds = media.usedIn
      .filter((u) => u.entityType === "post")
      .map((u) => u.entityId);

    let posts = [];
    if (postIds.length > 0) {
      posts = await Post.find({ _id: { $in: postIds } })
        .select("title slug published")
        .lean();
    }

    return {
      usageCount: media.usageCount,
      usedIn: media.usedIn.map((u) => {
        const post = posts.find(
          (p) => p._id.toString() === u.entityId?.toString()
        );
        return {
          ...u,
          entity: post || null,
        };
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  GLOBAL REPLACE
  // ═══════════════════════════════════════════════════════════════════

  async replaceAsset(userId, mediaId, newFile) {
    const existing = await MediaAsset.findOne({
      _id: mediaId,
      user: userId,
      del_flag: 0,
    });
    if (!existing) throw new Error("Media not found");

    const oldUrls = existing.urls ? existing.urls.toObject() : {};

    // Process and upload new image
    const processed = await imageQueue.add(() =>
      this._processImage(newFile.buffer)
    );
    const newUrls = await this._uploadVariants(
      userId,
      processed,
      newFile.originalname
    );

    // Update media record
    existing.urls = {
      original: newUrls.original,
      webp: newUrls.webp,
      thumbnail_sm: newUrls.thumbnail_sm,
      thumbnail_md: newUrls.thumbnail_md,
      thumbnail_lg: newUrls.thumbnail_lg,
    };
    existing.originalFilename = this._sanitizeFilename(newFile.originalname);
    existing.mimeType = newFile.mimetype;
    existing.fileHash = crypto
      .createHash("sha256")
      .update(newFile.buffer)
      .digest("hex");
    existing.dimensions = processed.dimensions;
    existing.fileSize = newFile.buffer.length;
    existing.fileSizeWebp = processed.webpBuffer?.length || null;
    existing.providerAssetId = newUrls._publicId;
    await existing.save();

    // Batch-update all posts referencing old URLs
    const postsAffected = await this._replaceUrlsInPosts(
      existing.usedIn || [],
      oldUrls,
      newUrls
    );

    // Clean up old Cloudinary assets (fire-and-forget)
    this._cleanupOldAssets(oldUrls).catch((err) =>
      console.error("Cloudinary cleanup error:", err.message)
    );

    return { media: existing, postsAffected };
  }

  async _replaceUrlsInPosts(usedIn, oldUrls, newUrls) {
    let count = 0;
    const postUsages = (usedIn || []).filter((u) => u.entityType === "post");

    for (const usage of postUsages) {
      const post = await Post.findById(usage.entityId);
      if (!post || !post.content) continue;

      let content = post.content;
      let changed = false;

      // Replace each URL variant
      for (const [key, oldUrl] of Object.entries(oldUrls)) {
        if (key.startsWith("_") || !oldUrl || !newUrls[key]) continue;
        const newContent = content.split(oldUrl).join(newUrls[key]);
        if (newContent !== content) {
          content = newContent;
          changed = true;
        }
      }

      if (changed) {
        post.content = content;
        await post.save();
        count++;
      }
    }

    return count;
  }

  async _cleanupOldAssets(urls) {
    for (const [key, url] of Object.entries(urls)) {
      if (key.startsWith("_") || !url || typeof url !== "string") continue;
      try {
        // Extract public_id from Cloudinary URL
        const parts = url.split("/upload/");
        if (parts.length === 2) {
          const publicId = parts[1].replace(/\.[^.]+$/, "");
          await cloudinary.uploader.destroy(publicId);
        }
      } catch {
        // Best-effort cleanup — log but don't throw
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DELETE
  // ═══════════════════════════════════════════════════════════════════

  async softDelete(userId, mediaId) {
    const media = await MediaAsset.findOneAndUpdate(
      { _id: mediaId, user: userId, del_flag: 0 },
      { $set: { del_flag: 1 } },
      { new: true }
    );
    if (!media) throw new Error("Media not found");

    if (media.folder) {
      await MediaFolder.findByIdAndUpdate(media.folder, {
        $inc: { assetCount: -1 },
      });
    }

    return media;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  async bulkMove(userId, mediaIds, targetFolderId) {
    // Get current folder counts to update
    const assets = await MediaAsset.find({
      _id: { $in: mediaIds },
      user: userId,
      del_flag: 0,
    }).select("folder");

    // Decrement old folders
    const oldFolderCounts = {};
    for (const asset of assets) {
      const fid = asset.folder?.toString() || "root";
      oldFolderCounts[fid] = (oldFolderCounts[fid] || 0) + 1;
    }
    for (const [fid, count] of Object.entries(oldFolderCounts)) {
      if (fid !== "root") {
        await MediaFolder.findByIdAndUpdate(fid, {
          $inc: { assetCount: -count },
        });
      }
    }

    // Move assets
    const result = await MediaAsset.updateMany(
      { _id: { $in: mediaIds }, user: userId, del_flag: 0 },
      { $set: { folder: targetFolderId || null } }
    );

    // Increment new folder
    if (targetFolderId) {
      await MediaFolder.findByIdAndUpdate(targetFolderId, {
        $inc: { assetCount: result.modifiedCount },
      });
    }

    return result.modifiedCount;
  }

  async bulkTag(userId, mediaIds, tags, operation = "add") {
    const update =
      operation === "add"
        ? { $addToSet: { tags: { $each: tags } } }
        : { $pullAll: { tags } };

    const result = await MediaAsset.updateMany(
      { _id: { $in: mediaIds }, user: userId, del_flag: 0 },
      update
    );
    return result.modifiedCount;
  }

  async bulkFavorite(userId, mediaIds, isFavorite) {
    const result = await MediaAsset.updateMany(
      { _id: { $in: mediaIds }, user: userId, del_flag: 0 },
      { $set: { isFavorite } }
    );
    return result.modifiedCount;
  }

  async bulkDelete(userId, mediaIds) {
    // Update folder counts
    const assets = await MediaAsset.find({
      _id: { $in: mediaIds },
      user: userId,
      del_flag: 0,
    }).select("folder");

    const folderCounts = {};
    for (const asset of assets) {
      const fid = asset.folder?.toString();
      if (fid) folderCounts[fid] = (folderCounts[fid] || 0) + 1;
    }
    for (const [fid, count] of Object.entries(folderCounts)) {
      await MediaFolder.findByIdAndUpdate(fid, {
        $inc: { assetCount: -count },
      });
    }

    const result = await MediaAsset.updateMany(
      { _id: { $in: mediaIds }, user: userId, del_flag: 0 },
      { $set: { del_flag: 1 } }
    );
    return result.modifiedCount;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════

  _sanitizeFilename(name) {
    if (!name) return "untitled";
    return name
      .replace(/<[^>]*>/g, "")          // Strip HTML
      .replace(/[^\w\s._-]/g, "")       // Allow only safe chars
      .substring(0, 255)
      .trim() || "untitled";
  }
}

module.exports = new MediaAssetService();
