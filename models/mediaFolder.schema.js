const mongoose = require("mongoose");

const { Schema } = mongoose;

const mediaFolderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "media_folder",
      default: null,
    },
    color: { type: String, default: "#6366f1" },
    assetCount: { type: Number, default: 0 },
    del_flag: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "media_folders",
  }
);

// User's folder tree
mediaFolderSchema.index(
  { user: 1, parent: 1, del_flag: 1 },
  { name: "idx_user_folder_tree" }
);

// Unique folder name per user per parent
mediaFolderSchema.index(
  { user: 1, parent: 1, slug: 1 },
  { name: "idx_unique_folder_name", unique: true }
);

module.exports = mongoose.model("media_folder", mediaFolderSchema);
