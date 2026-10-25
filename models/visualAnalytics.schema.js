const mongoose = require("mongoose");
const { Schema } = mongoose;

// =============================================================================
//  OPENIDEAR — VISUAL ASSISTANT ANALYTICS SCHEMA (SPRINT 3)
//  models/visualAnalytics.schema.js
//
//  Tracks author interaction telemetry:
//  - generated
//  - accepted
//  - regenerated
//  - deleted
//  - search_preferred
//  These metrics improve future recommendations and calibrate decision weights.
// =============================================================================

const VisualAnalyticsSchema = new Schema(
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

// High-performance compound indexes for telemetry dashboards and optimization queries
VisualAnalyticsSchema.index({ userId: 1, actionTaken: 1, createdAt: -1 });
VisualAnalyticsSchema.index({ visualType: 1, actionTaken: 1 });
VisualAnalyticsSchema.index({ createdAt: -1 });

const VisualAnalytics =
  mongoose.models.VisualAnalytics ||
  mongoose.model("VisualAnalytics", VisualAnalyticsSchema);

module.exports = { VisualAnalytics };
