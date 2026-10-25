import mongoose, { Document, Model, Schema, Types } from "mongoose";

// =============================================================================
//  READING PROGRESS TYPESCRIPT SCHEMA & INTERFACE
//  models/readingProgress.schema.ts
// =============================================================================

export interface IReadingProgress {
  userId: Types.ObjectId;
  articleId: Types.ObjectId;
  progress: number;
  lastHeadingId?: string | null;
  lastParagraphIndex?: number | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReadingProgressDocument extends IReadingProgress, Document {}

export const readingProgressSchema = new Schema<IReadingProgressDocument>(
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

readingProgressSchema.index({ userId: 1, articleId: 1 }, { unique: true });
readingProgressSchema.index({ userId: 1, updatedAt: -1 });
readingProgressSchema.index({ userId: 1, completedAt: 1 });

export const ReadingProgress: Model<IReadingProgressDocument> =
  mongoose.models.readingProgress ||
  mongoose.model<IReadingProgressDocument>("readingProgress", readingProgressSchema);

export default ReadingProgress;
