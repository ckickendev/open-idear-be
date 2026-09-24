const mongoose = require("mongoose");
const { Schema } = mongoose;

// =============================================================================
//  READING PROGRESS MONGOOSE SCHEMA
//  models/readingProgress.schema.js
//
//  Design Decisions:
//  - Tracks user reading position and completion status per article.
//  - Stores progress percentage (0-100), last read heading anchor, and paragraph index.
//  - CompletedAt timestamp recorded when user reaches >=90% and bottom sentinel.
//  - Compound unique index ensures one progress record per (userId, articleId).
//  - Recency index (userId, updatedAt: -1) enables sub-millisecond continue-reading queries.
// =============================================================================

const readingProgressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "post",
      required: true,
      index: true,
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    lastHeadingId: {
      type: String,
      default: null,
      trim: true,
    },
    lastParagraphIndex: {
      type: Number,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: only one progress record per user per article
readingProgressSchema.index({ userId: 1, articleId: 1 }, { unique: true });

// Recency index: fast retrieval for "Continue Reading" shelf sorted by recent activity
readingProgressSchema.index({ userId: 1, updatedAt: -1 });

// Completion index: fast aggregation for completed articles count
readingProgressSchema.index({ userId: 1, completedAt: 1 });

const ReadingProgress = mongoose.model("readingProgress", readingProgressSchema);

module.exports = {
  ReadingProgress,
  readingProgressSchema,
};
