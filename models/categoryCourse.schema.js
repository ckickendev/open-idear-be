const mongoose = require("mongoose");

const { Schema } = mongoose;
const categoryCourseSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: "course", required: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "category", required: true },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("categoryCourse", categoryCourseSchema);
