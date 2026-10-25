// =============================================================================
//  OPENIDEAR SHOP — COMMERCE ANALYTICS EVENT SCHEMA (SPRINT S6)
//  models/shopAnalyticsEvent.schema.js
// =============================================================================

const mongoose = require("mongoose");
const { Schema } = mongoose;

const SHOP_ANALYTICS_EVENT_TYPES = [
  "embed_impression",
  "embed_click",
  "detail_view",
  "inquiry_attempt",
];

const shopAnalyticsEventSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: SHOP_ANALYTICS_EVENT_TYPES,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "ShopProduct",
      required: true,
      index: true,
    },
    articleSlug: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,
      index: true,
    },
    embedId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    sessionHash: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Fast compound indexes for funnel aggregation and time-range reporting
shopAnalyticsEventSchema.index({ eventType: 1, createdAt: -1 });
shopAnalyticsEventSchema.index({ productId: 1, eventType: 1, createdAt: -1 });
shopAnalyticsEventSchema.index({ articleSlug: 1, eventType: 1, createdAt: -1 });

// Automatic 90-day time-to-live (TTL) expiration to preserve disk performance
shopAnalyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

module.exports = {
  ShopAnalyticsEvent: mongoose.model(
    "ShopAnalyticsEvent",
    shopAnalyticsEventSchema,
    "ShopAnalyticsEvent"
  ),
  SHOP_ANALYTICS_EVENT_TYPES,
};
