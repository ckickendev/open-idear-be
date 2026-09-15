const mongoose = require("mongoose");
const { Schema } = mongoose;

const aiJobSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["course_intelligence", "media_metadata", "article_planning", "article_writing", "custom"],
      default: "course_intelligence",
      index: true,
    },
    capability: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "course",
      default: null,
      index: true,
    },
    lesson: {
      type: Schema.Types.ObjectId,
      ref: "lesson",
      default: null,
      index: true,
    },
    mediaAssetId: {
      type: Schema.Types.ObjectId,
      ref: "media_asset",
      default: null,
      index: true,
    },
    sourceMedia: {
      type: Schema.Types.ObjectId,
      ref: "media",
      default: null,
    },
    sourceMediaVersion: {
      type: Number,
      default: 1,
    },
    inputFingerprint: {
      type: String,
      required: true,
      index: true,
    },
    outputReference: {
      refType: { type: String, default: "lesson_intelligence" },
      refId: { type: Schema.Types.ObjectId, default: null },
    },
    provider: {
      type: String,
      default: "gemini",
    },
    model: {
      type: String,
      default: "gemini-2.5-flash",
    },
    promptVersion: {
      type: String,
      default: "v1.0",
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
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
    errorCode: {
      type: String,
      default: null,
    },
    forceOverwrite: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "ai_jobs",
  }
);

// Compound indexes for idempotency, retry polling, and audit queries
aiJobSchema.index({ inputFingerprint: 1, status: 1 });
aiJobSchema.index({ lesson: 1, capability: 1, createdAt: -1 });
aiJobSchema.index({ status: 1, runAt: 1, createdAt: 1 });

module.exports = mongoose.model("ai_job", aiJobSchema);
