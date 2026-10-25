import mongoose, { Schema, Document, Model } from "mongoose";

export type VisualActionType =
  | "visual_suggestion_created"
  | "visual_search_started"
  | "visual_search_selected"
  | "visual_generation_started"
  | "visual_generation_accepted"
  | "visual_generation_rejected"
  | "visual_generation_regenerated"
  | "visual_suggestion_dismissed"
  // Batch Search & Visual Assistant Actions
  | "batch_search_started"
  | "batch_search_completed"
  | "search_success"
  | "search_failure"
  | "candidate_selected"
  | "image_applied"
  | "suggestion_dismissed"
  | "ai_fallback_requested"
  | "generated"
  | "accepted"
  | "regenerated"
  | "deleted"
  | "search_preferred"
  | "ai_image_opened"
  | "ai_image_context_detected"
  | "ai_image_recommendation_shown"
  | "ai_image_generated"
  | "ai_image_regenerated"
  | "ai_image_accepted"
  | "ai_image_rejected"
  | "ai_image_inserted";

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
