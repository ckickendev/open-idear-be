import mongoose, { Schema, Document, Model } from "mongoose";

export type VisualActionType =
  | "generated"
  | "accepted"
  | "regenerated"
  | "deleted"
  | "search_preferred";

export interface IVisualAnalytics extends Document {
  userId?: mongoose.Types.ObjectId | null;
  postId?: mongoose.Types.ObjectId | null;
  heading: string;
  visualType: string;
  recommendedAction: string;
  actionTaken: VisualActionType;
  preset?: string | null;
  prompt?: string | null;
  confidence?: number | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const VisualAnalyticsSchema = new Schema<IVisualAnalytics>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: false,
      default: null,
      index: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: "post",
      required: false,
      default: null,
      index: true,
    },
    heading: {
      type: String,
      trim: true,
      default: "",
    },
    visualType: {
      type: String,
      trim: true,
      default: "illustration",
      index: true,
    },
    recommendedAction: {
      type: String,
      trim: true,
      default: "generate",
    },
    actionTaken: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    preset: {
      type: String,
      trim: true,
      default: null,
    },
    prompt: {
      type: String,
      trim: true,
      default: null,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "visual_analytics",
  }
);

VisualAnalyticsSchema.index({ userId: 1, actionTaken: 1, createdAt: -1 });
VisualAnalyticsSchema.index({ visualType: 1, actionTaken: 1 });
VisualAnalyticsSchema.index({ createdAt: -1 });

export const VisualAnalytics: Model<IVisualAnalytics> =
  mongoose.models.VisualAnalytics ||
  mongoose.model<IVisualAnalytics>("VisualAnalytics", VisualAnalyticsSchema);
