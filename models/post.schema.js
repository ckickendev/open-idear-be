const mongoose = require("mongoose");

const { Schema } = mongoose;
const postSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    image: { type: mongoose.Schema.Types.ObjectId, ref: "media" }, // Image URL for the post
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" }, // Description for the post
    content: { type: String, required: true },
    text: { type: String, required: true }, // Text content for search indexing
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "category" },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "tag" }], // Array of tag names
    published: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }], // Users who liked the post
    marked: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }], // Users who marked the post
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "comment" }],
    isFreePreview: { type: Boolean, default: false },
    lessonType: { type: String, enum: ["video", "file", "text"], default: "text" },
    mediaContent: { type: mongoose.Schema.Types.ObjectId, ref: "media" },
    del_flag: {
      type: Number,
      default: 0
    },
    readtime: {
      type: Number,
      default: 0
    },
  },
  {
    versionKey: '_somethingElse',
    timestamps: true,
  }
);

// Indexes for performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });
postSchema.index({ text: "text" }); // Full text search index

module.exports = mongoose.model("post", postSchema);
