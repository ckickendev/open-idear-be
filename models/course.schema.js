const mongoose = require("mongoose");

const { Schema } = mongoose;
const courseSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        title: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String, default: "" },
        thumbnail: { type: mongoose.Schema.Types.ObjectId, ref: "media" },
        category: { type: mongoose.Schema.Types.ObjectId, ref: "category" },
        topics: [{ type: mongoose.Schema.Types.ObjectId, ref: "topic" }],
        instructor: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        price: { type: Number, default: 0 },
        discountPrice: { type: Number, default: 0 },
        enrolledUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
        chapters: [{ type: mongoose.Schema.Types.ObjectId, ref: "chapter" }],
        status: { type: String, enum: ["draft", "published"], default: "draft" },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("course", courseSchema);
