import mongoose, { Document, Model, Schema, Types } from "mongoose";

// =============================================================================
//  ARTICLE VERSION MONGOOSE SCHEMA (TYPESCRIPT)
//  models/articleVersion.schema.ts
//
//  Design Decisions:
//  - Represents an immutable snapshot of an article at a point in time.
//  - Stores full content (html, markdown, structured blocks) and version metadata.
//  - Tracks author attribution, changelog narrative, and generation source (manual | ai).
//  - Strictly append-only: previous version records must never be mutated.
//  - Compound unique index ensures version string uniqueness per article.
// =============================================================================

export interface IArticleVersion extends Document {
  articleId: Types.ObjectId;
  version: string;
  markdown: string;
  html: string;
  blocks?: any[];
  changelog: string;
  createdBy: Types.ObjectId;
  source: "manual" | "ai";
  createdAt: Date;
  updatedAt: Date;
}

export const articleVersionSchema = new Schema<IArticleVersion>(
  {
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "post",
      required: true,
      index: true,
    },
    version: {
      type: String,
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

articleVersionSchema.index({ articleId: 1, version: 1 }, { unique: true });
articleVersionSchema.index({ articleId: 1, createdAt: -1 });

export const ArticleVersion: Model<IArticleVersion> =
  (mongoose.models.articleVersion as Model<IArticleVersion>) ||
  mongoose.model<IArticleVersion>("articleVersion", articleVersionSchema);

module.exports = {
  ArticleVersion,
  articleVersionSchema,
};
