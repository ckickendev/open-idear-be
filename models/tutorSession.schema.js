const mongoose = require("mongoose");
const { Schema } = mongoose;

const tutorSessionSchema = new Schema(
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
        status: {
            type: String,
            enum: ["active", "closed"],
            default: "active",
            index: true,
        },
        messageCount: {
            type: Number,
            default: 0,
        },
        lastActivityAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: "tutor_sessions",
    }
);

tutorSessionSchema.index({ user: 1, lesson: 1, updatedAt: -1 });

module.exports = mongoose.model("tutor_session", tutorSessionSchema);
