import mongoose, { Document, Model, Schema, Types } from "mongoose";

// =============================================================================
//  COLLECTION TYPESCRIPT INTERFACE & SCHEMA
//  models/collection.schema.ts
// =============================================================================

export type CollectionVisibility = "PUBLIC" | "PRIVATE" | "UNLISTED";

export interface ICollectionCollaborator {
  userId: Types.ObjectId;
  role: "editor" | "viewer";
}

export interface ICollection {
  owner: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  visibility: CollectionVisibility;
  coverImage?: string | null;
  collaborators?: ICollectionCollaborator[];
  followers?: Types.ObjectId[];
  isAiGenerated?: boolean;
  aiPrompt?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICollectionDocument extends ICollection, Document {}

export const collectionSchema = new Schema<ICollectionDocument>(
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
    collaborators: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "user" },
        role: { type: String, enum: ["editor", "viewer"], default: "editor" },
      },
    ],
    followers: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      },
    ],
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

collectionSchema.index({ owner: 1, createdAt: -1 });
collectionSchema.index({ slug: 1 });
collectionSchema.index({ visibility: 1, createdAt: -1 });

export const Collection: Model<ICollectionDocument> =
  mongoose.models.collection ||
  mongoose.model<ICollectionDocument>("collection", collectionSchema);

export default Collection;
