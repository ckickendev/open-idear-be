const mongoose = require("mongoose");
const { Schema } = mongoose;

const learningEvidenceSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "course",
            required: true,
            index: true,
        },
        lesson: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "lesson",
            required: true,
            index: true,
        },
        objective: {
            type: String,
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: [
                "knowledge_check",
                "tutor_interaction",
                "lesson_completion",
                "video_progress",
                "re_attempt",
            ],
            required: true,
        },
        signal: {
            type: String,
            enum: ["positive", "negative", "neutral"],
            required: true,
        },
        strength: {
            type: Number,
            min: 0.1,
            max: 1.0,
            default: 1.0,
        },
        sourceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        category: {
            type: String,
            enum: ["comprehension", "engagement", "interaction"],
            default: "comprehension",
        },
        idempotencyKey: {
            type: String,
            default: null,
        },
        metadata: {
            score: { type: Number },
            questionId: { type: String },
            attemptId: { type: mongoose.Schema.Types.ObjectId },
            tutorMessageId: { type: mongoose.Schema.Types.ObjectId },
            timestampSeconds: { type: Number },
            notes: { type: String },
        },
    },
    {
        timestamps: true,
        collection: "learning_evidences",
    }
);

learningEvidenceSchema.index({ user: 1, lesson: 1, createdAt: -1 });
learningEvidenceSchema.index({ user: 1, course: 1, objective: 1 });
learningEvidenceSchema.index({ idempotencyKey: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model("learning_evidence", learningEvidenceSchema);
