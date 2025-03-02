const mongoose = require("mongoose");

const { Schema } = mongoose;
const traitSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: String,
    image: String,
    effect: String,
    name_api: String,
    unit_activate: Array,
    champions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "champions",
      },
    ],
    del_flag: {
      type: Number,
      default: 0
    },
  },
  {
    versionKey: '_somethingElse',
    timestamps: true,
  }
);

module.exports = mongoose.model("traits", traitSchema);
