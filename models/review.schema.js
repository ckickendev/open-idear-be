const mongoose = require("mongoose");

const { Schema } = mongoose;
const reviewSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        course: { type: mongoose.Schema.Types.ObjectId, ref: "course", required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        score: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, default: "" },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("review", reviewSchema);
