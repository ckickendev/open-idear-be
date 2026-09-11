const mongoose = require("mongoose");
const { Schema } = mongoose;

const segmentSchema = new Schema(
    {
        start: { type: Number, required: true }, // Start time in seconds
        end: { type: Number, required: true },   // End time in seconds
        text: { type: String, required: true },
    },
    { _id: false }
);

const chapterMarkerSchema = new Schema(
    {
        timestamp: { type: String, required: true }, // e.g. "04:32"
        seconds: { type: Number, required: true },
        title: { type: String, required: true },
        summary: { type: String, default: "" },
    },
    { _id: false }
);

const lessonIntelligenceSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        lesson: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "lesson",
            required: true,
            index: true,
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "course",
            required: true,
            index: true,
        },
        sourceMedia: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "media",
            default: null,
        },
        sourceMediaVersion: {
            type: Number,
            default: 1,
        },
        sourceMediaFingerprint: {
            type: String,
            default: "",
        },
        inputFingerprint: {
            type: String,
            default: "",
            index: true,
        },
        version: {
            type: Number,
            default: 1,
        },
        status: {
            type: String,
            enum: ["queued", "processing", "completed", "failed"],
            default: "queued",
            index: true,
        },
        capabilityStatuses: {
            transcript: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
            summary: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
            keyPoints: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
            learningObjectives: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
            concepts: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
            keywords: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
            videoChapters: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
        },
        error: {
            type: String,
            default: null,
        },
        errorCode: {
            type: String,
            default: null,
        },
        transcript: {
            status: {
                type: String,
                enum: ["pending", "processing", "ready", "failed"],
                default: "ready",
            },
            language: { type: String, default: "en" },
            text: { type: String, default: "" },
            segments: [segmentSchema],
            provider: { type: String, default: "cloudflare" },
            generatedAt: { type: Date, default: Date.now },
        },
        summary: {
            short: { type: String, default: "" },
            detailed: { type: String, default: "" },
        },
        keyPoints: [{ type: String }],
        learningObjectives: [{ type: String }],
        concepts: [{ type: String }],
        keywords: [{ type: String }],
        suggestedVideoChapters: [chapterMarkerSchema],
        suggestedChapters: [chapterMarkerSchema], // Alias for backward compatibility
        model: {
            type: String,
            default: "gemini-2.5-flash",
        },
        promptVersion: {
            type: String,
            default: "v1.0",
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        acceptedFields: [{ type: String }],
        isStale: {
            type: Boolean,
            default: false,
        },
        generatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: "lesson_intelligences",
    }
);

// Compound query indexes
lessonIntelligenceSchema.index({ lesson: 1, version: -1 });
lessonIntelligenceSchema.index({ lesson: 1, inputFingerprint: 1 });

module.exports = mongoose.model("lesson_intelligence", lessonIntelligenceSchema);
