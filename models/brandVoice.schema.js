const mongoose = require("mongoose");

const { Schema } = mongoose;

const brandVoiceSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    tone: {
      type: String,
      required: true,
      default: "Friendly Senior Engineer",
    },
    emoji: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      default: "low",
    },
    language: {
      type: String,
      default: "Vietnamese",
    },
    codeStyle: {
      type: String,
      default: "TypeScript",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("brand_voice", brandVoiceSchema);
