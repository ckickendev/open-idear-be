const mongoose = require("mongoose");

const { Schema } = mongoose;
const lessonSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        title: { type: String, required: true },
        slug: { type: String, required: true },
        description: { type: String, default: "" },
        content: { type: String, default: "" }, // Text content for text-based lessons
        media: { type: mongoose.Schema.Types.ObjectId, ref: "media" }, // For video/file lessons
        type: { type: String, enum: ["video", "file", "text"], default: "text" },
        isFreePreview: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
        chapter: { type: mongoose.Schema.Types.ObjectId, ref: "chapter", required: true },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("lesson", lessonSchema);
