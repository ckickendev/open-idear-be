const mongoose = require("mongoose");

const { Schema } = mongoose;
const notificationSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        type: { type: String, enum: ["like", "comment", "new_post"], required: true },
        post: { type: mongoose.Schema.Types.ObjectId, ref: "post" },
        fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "user" }, // Who triggered the notification
        seen: { type: Boolean, default: false },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("notification", notificationSchema);
