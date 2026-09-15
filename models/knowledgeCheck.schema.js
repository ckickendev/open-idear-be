const mongoose = require("mongoose");
const { Schema } = mongoose;

const optionSchema = new Schema(
    {
        id: { type: String, required: true }, // e.g. "opt_1", "opt_2"
        text: { type: String, required: true },
    },
    { _id: false }
);

const questionSchema = new Schema(
    {
        id: { type: String, required: true }, // e.g. "q_1", "q_2"
        question: { type: String, required: true },
        options: [optionSchema],
        correctOptionId: { type: String, required: true },
        explanation: { type: String, required: true },
        objectiveReference: { type: String, default: "" },
        cognitiveLevel: {
            type: String,
            enum: ["remember", "understand", "apply", "analyze"],
            default: "understand",
        },
    },
    { _id: false }
);

const knowledgeCheckSchema = new Schema(
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
        version: {
            type: Number,
            default: 1,
        },
        status: {
            type: String,
            enum: ["draft", "ready", "accepted", "stale", "failed"],
            default: "ready",
            index: true,
        },
        sourceIntelligenceVersion: {
            type: Number,
            default: 1,
        },
        sourceMediaVersion: {
            type: Number,
            default: 1,
        },
        inputFingerprint: {
            type: String,
            default: "",
            index: true,
        },
        questions: [questionSchema],
        model: {
            type: String,
            default: "gemini-2.5-flash",
        },
        promptVersion: {
            type: String,
            default: "v1.0",
        },
        isStale: {
            type: Boolean,
            default: false,
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        acceptedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            default: null,
        },
        error: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: "knowledge_checks",
    }
);

knowledgeCheckSchema.index({ lesson: 1, version: -1 });
knowledgeCheckSchema.index({ lesson: 1, status: 1 });

module.exports = mongoose.model("knowledge_check", knowledgeCheckSchema);
