const mongoose = require("mongoose");
const { Schema } = mongoose;

const tutorReferenceSchema = new Schema(
    {
        type: {
            type: String,
            enum: ["transcript", "objective", "concept", "summary", "knowledge_check"],
            required: true,
        },
        timestampSeconds: {
            type: Number,
            default: null,
        },
        label: {
            type: String,
            required: true,
        },
    },
    { _id: false }
);

const tutorMessageSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        session: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "tutor_session",
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
        lesson: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "lesson",
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        grounded: {
            type: Boolean,
            default: true,
        },
        confidence: {
            type: String,
            enum: ["high", "medium", "low"],
            default: "high",
        },
        references: [tutorReferenceSchema],
        suggestedFollowUps: [{ type: String }],
        model: {
            type: String,
            default: "gemini-2.5-flash",
        },
        promptVersion: {
            type: String,
            default: "v1.0",
        },
    },
    {
        timestamps: true,
        collection: "tutor_messages",
    }
);

tutorMessageSchema.index({ session: 1, createdAt: 1 });

module.exports = mongoose.model("tutor_message", tutorMessageSchema);
