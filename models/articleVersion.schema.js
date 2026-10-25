const mongoose = require("mongoose");
const { Schema } = mongoose;

// =============================================================================
//  ARTICLE VERSION MONGOOSE SCHEMA
//  models/articleVersion.schema.js
//
//  Design Decisions:
//  - Represents an immutable snapshot of an article at a point in time.
//  - Stores full content (html, markdown, structured blocks) and version metadata.
//  - Tracks author attribution, changelog narrative, and generation source (manual | ai).
//  - Strictly append-only: previous version records must never be mutated.
//  - Compound unique index ensures version string uniqueness per article.
// =============================================================================

const articleVersionSchema = new Schema(
  {
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "post",
      required: true,
      index: true,
    },
    version: {
      type: String, // e.g. "1.0", "1.1", "2.0"
      required: true,
      trim: true,
    },
    markdown: {
      type: String,
      default: "",
    },
    html: {
      type: String,
      required: true,
    },
    blocks: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },
    changelog: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    source: {
      type: String,
      enum: ["manual", "ai"],
      default: "manual",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
articleVersionSchema.index({ articleId: 1, version: 1 }, { unique: true });
articleVersionSchema.index({ articleId: 1, createdAt: -1 });

const ArticleVersion = mongoose.model("articleVersion", articleVersionSchema);

module.exports = {
  ArticleVersion,
  articleVersionSchema,
};
