const mongoose = require("mongoose");

const { Schema } = mongoose;
const seriesSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        image: { type: mongoose.Schema.Types.ObjectId, ref: "media" },
        title: { type: String, required: true },
        description: { type: String, default: "" },
        slug: { type: String, required: true, unique: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "post" }],
        marked: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }], // Users who marked the series
        price: { type: Number, default: 0 },
        enrolledUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

seriesSchema.index({ user: 1 });
seriesSchema.index({ del_flag: 1 });

module.exports = mongoose.model("series", seriesSchema);
