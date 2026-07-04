const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * =============================================================================
 *  ASSET SCHEMA
 *  models/asset.schema.js
 *
 *  Design Decisions:
 *  - Centralized schema for managing all uploaded, stock, and AI-generated assets.
 *  - Uses Mongoose ObjectIds for identity and user association.
 *  - Implements an optimized 'aiMetadata' block storing OCR and tag outputs to scale.
 *  - Built-in 'hash' indexes enforce user-scoped duplication limits.
 * =============================================================================
 */

const assetSchema = new Schema(
  {
    // ─── Identity & Ownership ────────────────────────────────
    _id: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // ─── File Identity ──────────────────────────────────────
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    hash: {
      type: String,
      required: true,
      index: true,
    },

    // ─── Storage URLs ────────────────────────────────────────
    url: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },

    // ─── Dimensions & Size ──────────────────────────────────
    size: { type: Number, required: true }, // File size in bytes
    width: { type: Number, required: true },
    height: { type: Number, required: true },

    // ─── Metadata & SEO ──────────────────────────────────────
    description: { type: String, default: "" },
    alt: { type: String, default: "" },
    tags: {
      type: [String],
      default: [],
      index: true,
    },

    // ─── Usage Tracking ─────────────────────────────────────
    usedInPosts: [
      {
        type: Schema.Types.ObjectId,
        ref: "post",
        index: true,
      },
    ],

    // ─── AI Metadata (Scalable Extension Block) ─────────────
    aiMetadata: {
      altText: { type: String },
      description: { type: String },
      tags: [String],
      ocrText: { type: String }, // Stores raw OCR extracted text content
      confidence: { type: Number },
      model: { type: String }, // e.g. "gemini-2.0-flash"
      generatedAt: { type: Date },
    },

    // ─── Soft Delete Flag ───────────────────────────────────
    del_flag: { type: Number, default: 0 },
  },
  {
    timestamps: true, // Auto-generates createdAt and updatedAt fields
    collection: "assets",
  }
);

// ─── compound indexes ───────────────────────────────────────

// Enforce unique file uploads per user to prevent duplicate CDN usage
assetSchema.index({ ownerId: 1, hash: 1 }, { unique: true });

// Browse assets sorted by upload date
assetSchema.index({ ownerId: 1, del_flag: 1, createdAt: -1 });

// Full-text search index for tags, alt, description, OCR, and filenames
assetSchema.index(
  {
    originalName: "text",
    alt: "text",
    description: "text",
    tags: "text",
    "aiMetadata.ocrText": "text",
  },
  {
    name: "idx_asset_text_search",
    weights: {
      originalName: 5,
      alt: 10,
      description: 3,
      tags: 8,
      "aiMetadata.ocrText": 6,
    },
  }
);

module.exports = mongoose.model("asset", assetSchema);
