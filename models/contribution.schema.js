const mongoose = require("mongoose");

const { Schema } = mongoose;

const contributionSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Who sent the contribution
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    // Contribution content
    type: {
      type: String,
      enum: ["feature", "bug", "improvement", "content", "other"],
      default: "other",
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    // Admin management
    status: {
      type: String,
      enum: ["new", "reviewed", "accepted", "rejected"],
      default: "new",
    },
    adminNote: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    // Soft delete
    del_flag: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
contributionSchema.index({ status: 1, createdAt: -1 });
contributionSchema.index({ user: 1, createdAt: -1 });
contributionSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model("contribution", contributionSchema);
