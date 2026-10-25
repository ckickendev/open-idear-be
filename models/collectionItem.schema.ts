import mongoose, { Document, Model, Schema, Types } from "mongoose";

// =============================================================================
//  COLLECTION ITEM TYPESCRIPT INTERFACE & SCHEMA
//  models/collectionItem.schema.ts
// =============================================================================

export interface ICollectionItem {
  collectionId: Types.ObjectId;
  articleId: Types.ObjectId;
  order: number;
  note?: string;
  addedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICollectionItemDocument extends ICollectionItem, Document {}

export const collectionItemSchema = new Schema<ICollectionItemDocument>(
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

collectionItemSchema.index({ collectionId: 1, articleId: 1 }, { unique: true });
collectionItemSchema.index({ collectionId: 1, order: 1 });

export const CollectionItem: Model<ICollectionItemDocument> =
  mongoose.models.collectionItem ||
  mongoose.model<ICollectionItemDocument>("collectionItem", collectionItemSchema);

export default CollectionItem;
