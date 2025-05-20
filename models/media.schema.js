const mongoose = require("mongoose");

const { Schema } = mongoose;
const mediaSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        url: { type: String, required: true },
        type: { type: String, enum: ["image", "video", "audio"], required: true },
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
