const mongoose = require("mongoose");

const { Schema } = mongoose;
const championSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    name: String,
    cost: Number,
    avatar: String,
    bgimage: String,
    skill: String,
    name_api: String,
    del_flag: {
      type: Number,
      default: 0
    },
    traits: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "traits",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("champions", championSchema);
