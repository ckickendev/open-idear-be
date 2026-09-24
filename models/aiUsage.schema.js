const mongoose = require("mongoose");
const { Schema } = mongoose;

// =============================================================================
//  AI USAGE MONGOOSE SCHEMA
//  models/aiUsage.schema.js
//
//  Design Decisions:
//  - Represents every AI model execution (both SUCCESS and FAILED).
//  - Strictly tracks user attribution, feature identifier, provider, tokens, latency, cost.
//  - High-performance compound indexes for user history and admin time-series aggregation.
//  - Decoupled from membership and billing (no credit deduction logic).
// =============================================================================

const AIUsageSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: false,
      default: null,
      index: true,
    },
    featureId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "default",
      index: true,
    },
    promptVersion: {
      type: String,
      required: true,
      default: "v1",
    },
    inputTokens: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    outputTokens: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalTokens: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    latency: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedCostUSD: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      required: true,
      default: "SUCCESS",
      index: true,
    },
    errorMessage: {
      type: String,
      required: false,
    },
    model: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "ai_usages",
  }
);

// ─── Performance Indexes ─────────────────────────────────────────────────────
// 1. Optimized for GET /api/ai/usage/me (User history & aggregations sorted by time)
AIUsageSchema.index({ userId: 1, createdAt: -1 });

// 2. Optimized for GET /api/ai/usage/admin time-range filtering
AIUsageSchema.index({ createdAt: -1 });

// 3. Optimized for feature usage breakdown & rankings
AIUsageSchema.index({ featureId: 1, createdAt: -1 });

// 4. Optimized for provider breakdown
AIUsageSchema.index({ provider: 1, createdAt: -1 });

// 5. Optimized for status & failure rate calculations
AIUsageSchema.index({ status: 1, createdAt: -1 });

const AIUsage =
  mongoose.models.AIUsage || mongoose.model("AIUsage", AIUsageSchema);

module.exports = {
  AIUsage,
  default: AIUsage,
};
