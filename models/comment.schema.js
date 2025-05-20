const mongoose = require("mongoose");

const { Schema } = mongoose;
const commentSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "post", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    content: { type: String, required: true },
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: "comment" }], // Nested replies
    del_flag: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("comment", commentSchema);
