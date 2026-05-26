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
        lastAccessedAt: { type: Date, default: Date.now },
        status: {
            type: String,
            enum: ["active", "completed", "refunded"],
            default: "active",
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate enrollments at the database level
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("enrollment", enrollmentSchema);
