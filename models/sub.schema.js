const mongoose = require("mongoose");

const { Schema } = mongoose;
const subSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        subscribedTo: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("sub", subSchema);
