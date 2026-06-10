const mongoose = require("mongoose");

const { Schema } = mongoose;

const supportTicketSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Sender info (optional — guest users can submit too)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    guestEmail: {
      type: String,
      default: "",
      trim: true,
    },
    // Ticket content
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      enum: ["account", "content", "payment", "technical", "fraud", "other"],
      default: "other",
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    // Admin management
    status: {
      type: String,
      enum: ["pending", "in_review", "resolved", "closed"],
      default: "pending",
    },
    adminNote: {
      type: String,
      default: "",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    resolvedAt: {
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
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, status: 1 });

module.exports = mongoose.model("support_ticket", supportTicketSchema);
