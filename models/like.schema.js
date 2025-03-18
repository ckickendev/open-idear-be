const mongoose = require("mongoose");

const { Schema } = mongoose;
const likeSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("like", likeSchema);
