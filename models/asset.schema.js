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
    type: {
      type: String,
      enum: ["image", "diagram", "illustration", "photo", "icon", "ai"],
      default: "image",
    },
    searchQuery: { type: String, default: "" },
    prompt: { type: String, default: "" },
    model: { type: String, default: "" },
    seed: { type: Number, default: 0 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    source: {
      type: String,
      enum: ["upload", "ai_generated", "stock", "placeholder", "asset_library"],
      default: "upload",
    },

    // ─── Provider Provenance (Sprint 2) ─────────────────────────
    // Tracks the external provider a stock image originated from.
    // Used for duplicate-by-source detection and attribution display.
    sourceProvider: { type: String, default: "" },  // e.g. "unsplash" | "pexels" | "pixabay"
    sourceUrl:      { type: String, default: "" },  // original source page URL (Unsplash photo page)
    author:         { type: String, default: "" },  // photographer/creator name
    license:        { type: String, default: "" },  // e.g. "unsplash" | "pexels" | "cc0"
    attributionUrl: { type: String, default: "" },  // link back to original source for attribution

    // ─── AI Illustration Metadata (Sprint 3) ───────────────────
    sourceType:   { type: String, default: "" },     // e.g. "ai"
    provider:     { type: String, default: "" },     // e.g. "gemini-imagen"
    style:        { type: String, default: "" },     // e.g. "isometric" | "blueprint"
    aspectRatio:  { type: String, default: "16:9" }, // e.g. "16:9" | "1:1"
    suggestionId: { type: String, default: "" },

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
assetSchema.index({ searchQuery: 1 });
assetSchema.index({ source: 1 });
// Sprint 2: compound index for duplicate-by-source detection
assetSchema.index({ sourceProvider: 1, sourceUrl: 1 }, { sparse: true });

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
