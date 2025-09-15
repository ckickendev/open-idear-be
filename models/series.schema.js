const mongoose = require("mongoose");

const { Schema } = mongoose;
const seriesSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        title: { type: String, required: true },
        description: { type: String, default: "" },
        slug: { type: String, required: true, unique: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "post" }],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("series", seriesSchema);
