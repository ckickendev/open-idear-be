const mongoose = require("mongoose");

const { Schema } = mongoose;
const lessonSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        title: { type: String, required: true },
        slug: { type: String, required: true },
        description: { type: String, default: "" },
        content: { type: String, default: "" }, // Text content for text-based lessons
        media: { type: mongoose.Schema.Types.ObjectId, ref: "media" }, // For video/file lessons
        type: { type: String, enum: ["video", "file", "text", "quiz", "assignment", "article"], default: "text" },
        isFreePreview: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
        chapter: { type: mongoose.Schema.Types.ObjectId, ref: "chapter", required: true },
        // Accepted AI intelligence fields
        summary: { type: String, default: "" },
        learningObjectives: [{ type: String }],
        keyPoints: [{ type: String }],
        concepts: [{ type: String }],
        keywords: [{ type: String }],
        suggestedVideoChapters: [{
            timestamp: { type: String },
            seconds: { type: Number },
            title: { type: String },
            summary: { type: String, default: "" },
        }],
        suggestedChapters: [{
            timestamp: { type: String },
            seconds: { type: Number },
            title: { type: String },
        }],
        aiIntelligence: {
            intelligenceId: { type: mongoose.Schema.Types.ObjectId, ref: "lesson_intelligence", default: null },
            acceptedVersion: { type: Number, default: 0 },
            acceptedAt: { type: Date, default: null },
            acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
            model: { type: String, default: "" },
            promptVersion: { type: String, default: "" },
            sourceMediaVersion: { type: Number, default: 1 },
        },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

lessonSchema.index({ chapter: 1, del_flag: 1, order: 1 });

module.exports = mongoose.model("lesson", lessonSchema);
