const mongoose = require("mongoose");

const { Schema } = mongoose;
const chapterSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        title: { type: String, required: true },
        course: { type: mongoose.Schema.Types.ObjectId, ref: "course", required: true },
        lessons: [{ type: mongoose.Schema.Types.ObjectId, ref: "lesson" }],
        order: { type: Number, default: 0 },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("chapter", chapterSchema);
