const mongoose = require("mongoose");

const { Schema } = mongoose;
const tagSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        name: { type: String, required: true, unique: true },
        slug: { type: String, required: true, unique: true },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("tag", tagSchema);
