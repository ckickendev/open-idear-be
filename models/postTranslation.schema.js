const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * =============================================================================
 *  POST TRANSLATION MONGOOSE SCHEMA (SPRINT 1 - BILINGUAL ARCHITECTURE)
 *  models/postTranslation.schema.js
 *
 *  Design Decisions:
 *  - Locale-specific content document linked 1:N to a parent Post document.
 *  - Holds localized fields: title, slug, description, content, text, blocks, hero,
 *    seo, published, publishedAt, readtime, and aiContext.
 *  - Independent publication lifecycle: An English translation being published does
 *    not automatically publish the Vietnamese translation.
 *  - Compound unique index { postId: 1, locale: 1 } ensures a post has at most
 *    one translation per locale.
 *  - Compound unique index { locale: 1, slug: 1 } ensures slug uniqueness per locale.
 * =============================================================================
 */

const postTranslationSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "post",
      required: true,
      index: true,
    },
    locale: {
      type: String,
      enum: ["en", "vi"],
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
    background: {
      type: String,
      default: "",
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    markdown: {
      type: String,
      default: "",
    },
    text: {
      type: String,
      required: true,
    },
    contentVersion: {
      type: String,
      enum: ["html-v1", "blocks-v1"],
      default: "html-v1",
    },
    blocks: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },
    hero: {
      type: new Schema(
        {
          title: { type: String },
          subtitle: { type: String },
          image: {
            type: new Schema(
              {
                src: { type: String },
                alt: { type: String },
              },
              { _id: false }
            ),
          },
          category: { type: String },
          readingTime: { type: Number },
          background: { type: String },
        },
        { _id: false }
      ),
      default: undefined,
    },
    aiContext: {
      type: new Schema(
        {
          plannerOutput: { type: Schema.Types.Mixed },
          writerOutput: {
            type: new Schema(
              {
                wordCount: { type: Number },
                estimatedReadingTime: { type: Number },
              },
              { _id: false }
            ),
          },
          growthResults: { type: Schema.Types.Mixed },
          generation: {
            type: new Schema(
              {
                model: { type: String },
                generatedAt: { type: Date },
              },
              { _id: false }
            ),
          },
        },
        { _id: false }
      ),
      default: undefined,
    },
    seo: {
      type: new Schema(
        {
          metaTitle: { type: String },
          metaDescription: { type: String },
          keywords: { type: [String], default: undefined },
          canonicalUrl: { type: String },
          schemaOrg: {
            type: new Schema(
              {
                article: { type: Schema.Types.Mixed },
                faqPage: { type: Schema.Types.Mixed },
              },
              { _id: false }
            ),
          },
        },
        { _id: false }
      ),
      default: undefined,
    },
    published: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    readtime: {
      type: Number,
      default: 0,
    },
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "articleVersion",
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Compound uniqueness: Each locale has unique slugs, and a post has at most one translation per locale
postTranslationSchema.index({ postId: 1, locale: 1 }, { unique: true });
postTranslationSchema.index({ locale: 1, slug: 1 }, { unique: true });
postTranslationSchema.index({ locale: 1, published: 1, createdAt: -1 });

module.exports = mongoose.model("post_translation", postTranslationSchema);
