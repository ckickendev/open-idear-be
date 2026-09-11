const mongoose = require("mongoose");
const { Schema } = mongoose;

const objectiveMasterySchema = new Schema(
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
        score: {
            type: Number, // 0 to 100
            default: 0,
            min: 0,
            max: 100,
        },
        level: {
            type: String,
            enum: ["unknown", "introduced", "developing", "proficient", "mastered"],
            default: "unknown",
        },
        evidenceCount: {
            type: Number,
            default: 0,
        },
        positiveEvidenceCount: {
            type: Number,
            default: 0,
        },
        negativeEvidenceCount: {
            type: Number,
            default: 0,
        },
        correctAttempts: {
            type: Number,
            default: 0,
        },
        incorrectAttempts: {
            type: Number,
            default: 0,
        },
        explanation: [{ type: String }],
        lastEvidenceAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: "objective_masteries",
    }
);

// Compound unique index per user, lesson, and objective
objectiveMasterySchema.index({ user: 1, lesson: 1, objective: 1 }, { unique: true });
objectiveMasterySchema.index({ user: 1, course: 1 });

module.exports = mongoose.model("objective_mastery", objectiveMasterySchema);
