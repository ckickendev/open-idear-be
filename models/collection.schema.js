const mongoose = require("mongoose");
const { Schema } = mongoose;

// =============================================================================
//  COLLECTION MONGOOSE SCHEMA (KNOWLEDGE COLLECTIONS)
//  models/collection.schema.js
//
//  Design Decisions:
//  - Pinterest for technical knowledge: curates articles into thematic binders.
//  - Visibility states: PUBLIC (discoverable), PRIVATE (owner only), UNLISTED (shared via link).
//  - Future-proofed for collaboration, AI generation, and follower architecture.
// =============================================================================

const collectionSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    visibility: {
      type: String,
      enum: ["PUBLIC", "PRIVATE", "UNLISTED"],
      default: "PUBLIC",
      index: true,
    },
    coverImage: {
      type: String,
      default: null,
    },
    // Future compatibility: collaborative curation
    collaborators: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "user" },
        role: { type: String, enum: ["editor", "viewer"], default: "editor" },
      },
    ],
    // Future compatibility: collection followers
    followers: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      },
    ],
    // Future compatibility: AI-generated collections
    isAiGenerated: {
      type: Boolean,
      default: false,
    },
    aiPrompt: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
collectionSchema.index({ owner: 1, createdAt: -1 });
collectionSchema.index({ slug: 1 });
collectionSchema.index({ visibility: 1, createdAt: -1 });

const Collection = mongoose.model("collection", collectionSchema);

module.exports = {
  Collection,
  collectionSchema,
};
