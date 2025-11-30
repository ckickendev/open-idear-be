const mongoose = require("mongoose");

const { Schema } = mongoose;
const categorySchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    del_flag: {
      type: Number,
      default: 0
    },
    background_image: { type: String },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("category", categorySchema);
