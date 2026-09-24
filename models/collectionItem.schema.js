const mongoose = require("mongoose");
const { Schema } = mongoose;

// =============================================================================
//  COLLECTION ITEM MONGOOSE SCHEMA (KNOWLEDGE COLLECTIONS)
//  models/collectionItem.schema.js
//
//  Design Decisions:
//  - Junction table connecting Collections and Articles (Post).
//  - Keeps ordering independent and fast to reorder.
//  - Supports per-item curator notes.
//  - Unique compound index on { collectionId, articleId } prevents duplicate entries.
// =============================================================================

const collectionItemSchema = new Schema(
  {
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: "collection",
      required: true,
      index: true,
    },
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "post",
      required: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate articles inside the same collection
collectionItemSchema.index({ collectionId: 1, articleId: 1 }, { unique: true });

// Fast sorting for ordered article retrieval
collectionItemSchema.index({ collectionId: 1, order: 1 });

const CollectionItem = mongoose.model("collectionItem", collectionItemSchema);

module.exports = {
  CollectionItem,
  collectionItemSchema,
};
