const mongoose = require("mongoose");

const { Schema } = mongoose;
const mediaSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        description: { type: String, default: "" },
        url: { type: String, required: true },
        alt: { type: String, default: "" },
        prompt: { type: String, default: "" },
        width: { type: Number, default: 1200 },
        height: { type: Number, default: 630 },
        duration: { type: Number, default: 0 }, // Duration in seconds for video/audio
        thumbnail: { type: String, default: "" }, // Playback thumbnail / poster URL
        status: { type: String, enum: ["uploaded", "processing", "ready", "failed"], default: "ready" },
        createdByAI: { type: Boolean, default: true },
        cloudflareId: { type: String },
        bunnyVideoId: { type: String, index: true },
        bunnyLibraryId: { type: String },
        provider: { type: String, enum: ["bunny", "cloudinary", "cloudflare", "local"], default: "bunny" },
        playbackUrl: { type: String, default: "" },
        errorMessage: { type: String, default: "" },
        idempotencyKey: { type: String, index: true },
        uploadExpiresAt: { type: Date },
        version: { type: Number, default: 1 },
        fingerprint: { type: String, default: "" },
        type: { type: String, enum: ["image", "video", "audio", "file"], default: "image", required: true },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("media", mediaSchema);
