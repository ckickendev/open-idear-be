const mongoose = require("mongoose");
const { Schema } = mongoose;

const attemptAnswerSchema = new Schema(
    {
        questionId: { type: String, required: true },
        selectedOptionId: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
    },
    { _id: false }
);

const knowledgeCheckAttemptSchema = new Schema(
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
        knowledgeCheck: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "knowledge_check",
            required: true,
        },
        knowledgeCheckVersion: {
            type: Number,
            required: true,
        },
        answers: [attemptAnswerSchema],
        score: {
            type: Number, // Percentage: 0 - 100
            required: true,
        },
        totalQuestions: {
            type: Number,
            required: true,
        },
        correctCount: {
            type: Number,
            required: true,
        },
        passed: {
            type: Boolean,
            required: true,
        },
        completedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: "knowledge_check_attempts",
    }
);

knowledgeCheckAttemptSchema.index({ user: 1, lesson: 1, createdAt: -1 });

module.exports = mongoose.model("knowledge_check_attempt", knowledgeCheckAttemptSchema);
