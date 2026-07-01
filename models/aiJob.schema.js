const mongoose = require("mongoose");
const { Schema } = mongoose;

const aiJobSchema = new Schema(
  {
    mediaAssetId: {
      type: Schema.Types.ObjectId,
      ref: "media_asset",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    runAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    forceOverwrite: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "ai_jobs",
  }
);

// Compound index for picking up pending/failed retry jobs efficiently
aiJobSchema.index({ status: 1, runAt: 1, createdAt: 1 });

module.exports = mongoose.model("ai_job", aiJobSchema);
