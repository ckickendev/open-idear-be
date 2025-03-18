const mongoose = require("mongoose");

const { Schema } = mongoose;
const postSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    tags: [{ type: String }], // Array of tag names
    published: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who liked the post
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
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

module.exports = mongoose.model("post", postSchema);
