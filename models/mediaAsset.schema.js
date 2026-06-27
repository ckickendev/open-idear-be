const mongoose = require("mongoose");

const { Schema } = mongoose;

const mediaAssetSchema = new Schema(
  {
    // ─── Ownership ──────────────────────────────────────────
    user: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // ─── File Identity ──────────────────────────────────────
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileHash: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["image", "video", "audio", "document"],
      required: true,
      index: true,
    },

    // ─── Storage URLs ───────────────────────────────────────
    urls: {
      original: { type: String, required: true },
      webp: { type: String },
      thumbnail_sm: { type: String }, // 150×150 cover crop
      thumbnail_md: { type: String }, // 400px wide
      thumbnail_lg: { type: String }, // 800px wide
    },

    // ─── Dimensions & Size ──────────────────────────────────
    dimensions: {
      width: { type: Number },
      height: { type: Number },
    },
    fileSize: { type: Number, required: true },
    fileSizeWebp: { type: Number },

    // ─── CDN Provider ───────────────────────────────────────
    provider: {
      type: String,
      enum: ["cloudinary", "cloudflare", "s3"],
      default: "cloudinary",
    },
    providerAssetId: { type: String },

    // ─── Metadata ───────────────────────────────────────────
    altText: { type: String, default: "" },
    description: { type: String, default: "" },
    tags: {
      type: [String],
      default: [],
      index: true,
    },

    // ─── Organization ───────────────────────────────────────
    folder: {
      type: Schema.Types.ObjectId,
      ref: "media_folder",
      default: null,
      index: true,
    },
    isFavorite: { type: Boolean, default: false, index: true },

    // ─── Usage Tracking ─────────────────────────────────────
    usedIn: [
      {
        entityType: {
          type: String,
          enum: [
            "post",
            "course",
            "series",
            "user_avatar",
            "user_background",
          ],
        },
        entityId: { type: Schema.Types.ObjectId },
        field: { type: String },
      },
    ],
    usageCount: { type: Number, default: 0 },

    // ─── AI Metadata ────────────────────────────────────────
    aiMetadata: {
      altText: { type: String },
      description: { type: String },
      tags: [String],
      generatedAt: { type: Date },
      model: { type: String },
      confidence: { type: Number },
    },

    // ─── Soft Delete ────────────────────────────────────────
    del_flag: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "media_assets",
  }
);

// ─── Compound Indexes ───────────────────────────────────────────

// Primary browse: user's media, sorted by date, excluding deleted
mediaAssetSchema.index(
  { user: 1, del_flag: 1, createdAt: -1 },
  { name: "idx_user_browse" }
);

// Deduplication: unique file per user
mediaAssetSchema.index(
  { user: 1, fileHash: 1 },
  { name: "idx_user_hash", unique: true }
);

// Folder browsing
mediaAssetSchema.index(
  { user: 1, folder: 1, del_flag: 1, createdAt: -1 },
  { name: "idx_user_folder" }
);

// Favorites filter
mediaAssetSchema.index(
  { user: 1, isFavorite: 1, del_flag: 1, createdAt: -1 },
  { name: "idx_user_favorites" }
);

// Tag filtering
mediaAssetSchema.index(
  { user: 1, tags: 1, del_flag: 1 },
  { name: "idx_user_tags" }
);

// Full-text search across filename, alt text, description, tags
mediaAssetSchema.index(
  {
    originalFilename: "text",
    altText: "text",
    description: "text",
    tags: "text",
  },
  {
    name: "idx_fulltext_search",
    weights: {
      altText: 10,
      tags: 8,
      originalFilename: 5,
      description: 3,
    },
  }
);

// Usage tracking: find media used in a specific post
mediaAssetSchema.index(
  { "usedIn.entityId": 1, "usedIn.entityType": 1 },
  { name: "idx_usage_lookup" }
);

module.exports = mongoose.model("media_asset", mediaAssetSchema);
