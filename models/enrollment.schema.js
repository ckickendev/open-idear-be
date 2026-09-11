const mongoose = require("mongoose");

const { Schema } = mongoose;
const enrollmentSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        course: { type: mongoose.Schema.Types.ObjectId, ref: "course", required: true },
        enrolledAt: { type: Date, default: Date.now },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "payment", default: null },
        progress: { type: Number, default: 0, min: 0, max: 100 },
        completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: "lesson" }],
        lastLesson: { type: mongoose.Schema.Types.ObjectId, ref: "lesson", default: null },
        lastAccessedAt: { type: Date, default: Date.now },
        completedAt: { type: Date, default: null },
        status: {
            type: String,
            enum: ["active", "completed", "refunded", "archived"],
            default: "active",
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate enrollments at the database level
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model("enrollment", enrollmentSchema);
