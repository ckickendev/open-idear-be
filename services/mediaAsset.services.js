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
  aiStatus: 1,
  aiError: 1,
  aiRetryCount: 1,
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

    const { duplicateDetectionService } = require("./duplicateDetection.services");
    const pHash = await duplicateDetectionService.computePHash(file.buffer);

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

    // Determine if user provided metadata on upload
    const userEditedFields = [];
    if (altText && altText.trim() !== "") userEditedFields.push("altText");
    if (description && description.trim() !== "") userEditedFields.push("description");

    // Step 5: Persist to MongoDB
    const media = new MediaAsset({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      originalFilename: this._sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      fileHash,
      pHash,
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
      userEditedFields,
      folder: folderId,
    });

    await media.save();

    // Step 6: Increment folder asset count if applicable
    if (folderId) {
      await MediaFolder.findByIdAndUpdate(folderId, {
        $inc: { assetCount: 1 },
      });
    }

    // Step 7: Enqueue background AI job for metadata generation
    try {
      const aiQueueService = require("./aiQueue.services");
      await aiQueueService.enqueue(media._id, userId);
    } catch (err) {
      console.error("[MediaAssetService] Failed to enqueue background AI job:", err.message);
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
    const { page = 1, limit = 30, sort = "-relevance" } = options;
    const skip = (page - 1) * limit;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        media: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      };
    }

    // 1. Run AI Query Expansion using the semantic search service helper
    const aiSemanticSearchService = require("./aiSemanticSearch.services");
    const expandedKeywords = await aiSemanticSearchService.expandQuery(trimmedQuery);

    // 2. Build local search query filter
    const textSearchString = [trimmedQuery, ...expandedKeywords].join(" ");
    const filter = {
      user: userId,
      del_flag: 0,
      $or: [
        { $text: { $search: textSearchString } },
        { originalFilename: { $regex: trimmedQuery, $options: "i" } },
        { altText: { $regex: trimmedQuery, $options: "i" } },
        { description: { $regex: trimmedQuery, $options: "i" } },
        { ocrText: { $regex: trimmedQuery, $options: "i" } },
        { provider: { $regex: trimmedQuery, $options: "i" } },
        { tags: { $in: expandedKeywords } },
        { "aiMetadata.altText": { $regex: trimmedQuery, $options: "i" } },
        { "aiMetadata.description": { $regex: trimmedQuery, $options: "i" } },
        { "aiMetadata.tags": { $in: expandedKeywords } },
      ],
    };

    // 3. Fetch matched documents
    let docs = await MediaAsset.find(filter).lean();

    // 4. Calculate relevance scores
    docs = docs.map((doc) => {
      const score = aiSemanticSearchService._calculateSemanticScore(doc, expandedKeywords);
      return { ...doc, relevanceScore: score };
    });

    // 5. Rank and Sort
    if (sort === "relevance" || sort === "-relevance") {
      docs.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else if (sort === "recentlyUsed" || sort === "-recentlyUsed") {
      docs.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    } else if (sort === "usageCount" || sort === "-usageCount") {
      docs.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    } else {
      // Standard schema fields sorting (e.g. originalFilename, fileSize)
      const field = sort.startsWith("-") ? sort.substring(1) : sort;
      const order = sort.startsWith("-") ? -1 : 1;
      docs.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (valA < valB) return -1 * order;
        if (valA > valB) return 1 * order;
        return 0;
      });
    }

    const total = docs.length;
    const paginatedDocs = docs.slice(skip, skip + limit);

    // 6. Project results to matching GRID_PROJECTION
    const projectedDocs = paginatedDocs.map((doc) => {
      return {
        _id: doc._id,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType,
        type: doc.type,
        urls: {
          original: doc.urls?.original,
          webp: doc.urls?.webp,
          thumbnail_sm: doc.urls?.thumbnail_sm,
          thumbnail_md: doc.urls?.thumbnail_md,
          thumbnail_lg: doc.urls?.thumbnail_lg,
        },
        dimensions: doc.dimensions,
        fileSize: doc.fileSize,
        isFavorite: doc.isFavorite,
        tags: doc.tags,
        folder: doc.folder,
        altText: doc.altText,
        usageCount: doc.usageCount,
        aiStatus: doc.aiStatus,
        aiError: doc.aiError,
        aiRetryCount: doc.aiRetryCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    return {
      media: projectedDocs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + projectedDocs.length < total,
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

  async getDuplicates(userId, mediaId) {
    const asset = await MediaAsset.findOne({ _id: mediaId, user: userId, del_flag: 0 }).select("fileHash pHash originalFilename urls");
    if (!asset) throw new Error("Media asset not found");

    const matches = [];

    // 1. Exact matches by SHA256 fileHash
    if (asset.fileHash) {
      const exactMatches = await MediaAsset.find({
        user: userId,
        _id: { $ne: mediaId },
        fileHash: asset.fileHash,
        del_flag: 0,
      }).select("_id originalFilename urls");
      
      for (const m of exactMatches) {
        matches.push({
          mediaId: m._id.toString(),
          originalFilename: m.originalFilename,
          urls: m.urls,
          matchType: "exact",
          distance: 0,
        });
      }
    }

    // 2. Near matches by perceptual hash (pHash)
    if (asset.pHash) {
      const { duplicateDetectionService } = require("./duplicateDetection.services");
      const allAssets = await MediaAsset.find({
        user: userId,
        _id: { $ne: mediaId },
        type: "image",
        pHash: { $exists: true, $ne: null },
        del_flag: 0,
      }).select("_id originalFilename urls pHash");

      for (const other of allAssets) {
        const distance = duplicateDetectionService.getHammingDistance(asset.pHash, other.pHash);
        if (distance <= 8) {
          // Prevent duplicate results if they already matched exactly
          if (!matches.some((m) => m.mediaId === other._id.toString())) {
            matches.push({
              mediaId: other._id.toString(),
              originalFilename: other.originalFilename,
              urls: other.urls,
              matchType: "near",
              distance,
            });
          }
        }
      }
    }

    return {
      fileHash: asset.fileHash,
      pHash: asset.pHash,
      matches,
    };
  }

  async getSimilarImages(userId, mediaId) {
    const asset = await MediaAsset.findOne({ _id: mediaId, user: userId, del_flag: 0 }).select("tags");
    if (!asset) throw new Error("Media asset not found");

    const tags = asset.tags || [];
    if (tags.length === 0) return [];

    return await MediaAsset.find({
      user: userId,
      _id: { $ne: mediaId },
      type: "image",
      tags: { $in: tags },
      del_flag: 0,
    })
      .limit(6)
      .select({ _id: 1, originalFilename: 1, urls: 1, type: 1 })
      .lean();
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

    const fieldUpdates = [];
    if (updates.altText !== undefined) fieldUpdates.push("altText");
    if (updates.description !== undefined) fieldUpdates.push("description");
    if (updates.tags !== undefined) fieldUpdates.push("tags");

    const updateObj = { $set: sanitized };
    if (fieldUpdates.length > 0) {
      updateObj.$addToSet = { userEditedFields: { $each: fieldUpdates } };
    }

    const media = await MediaAsset.findOneAndUpdate(
      { _id: mediaId, user: userId, del_flag: 0 },
      updateObj,
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

  async retryAI(userId, mediaId) {
    const media = await MediaAsset.findOne({
      _id: mediaId,
      user: userId,
      del_flag: 0,
    });
    if (!media) throw new Error("Media not found or access denied");

    // Delete existing jobs for this asset to avoid duplicate processing
    const { AIJob } = require("../models");
    await AIJob.deleteMany({ mediaAssetId: mediaId });

    const aiQueueService = require("./aiQueue.services");
    await aiQueueService.enqueue(mediaId, userId);

    return { mediaId, aiStatus: "pending" };
  }

  async regenerateAI(userId, mediaId, forceOverwrite = false) {
    const media = await MediaAsset.findOne({
      _id: mediaId,
      user: userId,
      del_flag: 0,
    });
    if (!media) throw new Error("Media not found or access denied");

    // Delete existing jobs for this asset to avoid duplicate processing
    const { AIJob } = require("../models");
    await AIJob.deleteMany({ mediaAssetId: mediaId });

    const aiQueueService = require("./aiQueue.services");
    await aiQueueService.enqueue(mediaId, userId, { forceOverwrite });

    return { mediaId, aiStatus: "pending" };
  }

  async importAsset(userId, unifiedId) {
    const [provider, photoId] = unifiedId.split("_");
    if (!provider || !photoId) {
      throw new Error("Invalid unified ID format.");
    }

    // 1. Check if already imported by checking provider keys
    const existing = await MediaAsset.findOne({
      user: userId,
      provider,
      providerAssetId: photoId,
      del_flag: 0,
    });

    if (existing) {
      return existing;
    }

    // 2. Resolve external media service driver and fetch details
    const { externalMediaService } = require("../external-media");
    const photo = await externalMediaService.getPhoto(provider, photoId);

    // 3. Download raw image binary buffer
    const buffer = await externalMediaService.download(provider, photoId);

    // 4. Compute file hash
    const fileHash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    const { duplicateDetectionService } = require("./duplicateDetection.services");
    const pHash = await duplicateDetectionService.computePHash(buffer);

    // Double check dedup check by file hash
    const existingHash = await MediaAsset.findOne({
      user: userId,
      fileHash,
      del_flag: 0,
    });

    if (existingHash) {
      // Mark as imported from this provider for future fast queries
      existingHash.provider = provider;
      existingHash.providerAssetId = photoId;
      await existingHash.save();
      return existingHash;
    }

    // 5. Process image buffer with sharp (queued)
    const processed = await imageQueue.add(() =>
      this._processImage(buffer)
    );

    // 6. Upload all variants to Cloudinary
    const originalFilename = `${provider}_${photoId}.jpg`;
    const urls = await this._uploadVariants(
      userId,
      processed,
      originalFilename
    );

    // Prepare metadata details incorporating author attributions
    const authorAttribution = photo.author.name
      ? `Photo by ${photo.author.name} on ${provider.toUpperCase()}.${photo.author.profileUrl ? ` (${photo.author.profileUrl})` : ""}`
      : `Photo from ${provider.toUpperCase()}.`;

    const finalDescription = photo.description
      ? `${photo.description}\n\n${authorAttribution}`
      : authorAttribution;

    // 7. Persist MediaAsset document
    const media = new MediaAsset({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      originalFilename,
      mimeType: "image/jpeg",
      fileHash,
      pHash,
      type: "image",
      urls: {
        original: urls.original,
        webp: urls.webp,
        thumbnail_sm: urls.thumbnail_sm,
        thumbnail_md: urls.thumbnail_md,
        thumbnail_lg: urls.thumbnail_lg,
      },
      dimensions: processed.dimensions,
      fileSize: buffer.length,
      fileSizeWebp: processed.webpBuffer?.length || null,
      provider,
      providerAssetId: photoId,
      altText: photo.alt || "Imported Image",
      description: finalDescription,
      tags: photo.tags || [],
      userEditedFields: [], // Initialize empty; AI will enrich fields
    });

    await media.save();

    // 8. Enqueue background AI Metadata Generation
    const aiQueueService = require("./aiQueue.services");
    await aiQueueService.enqueue(media._id, userId);

    return media;
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
