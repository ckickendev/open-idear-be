const mongoose = require("mongoose");

const { Schema } = mongoose;
const courseCategorySchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        name: { type: String, required: true, unique: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String },
        background_image: { type: String },
        del_flag: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("CourseCategory", courseCategorySchema);
