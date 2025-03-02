const mongoose = require("mongoose");

const { Schema } = mongoose;
const itemSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: String,
    image: String,
    effect: String,
    name_api: String,
    property: Object,
    del_flag: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("items", itemSchema);
