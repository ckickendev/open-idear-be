const mongoose = require("mongoose");
const slugify = require("slugify");

const { Schema } = mongoose;

const imageSubSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: null, trim: true },
    alt: { type: String, default: "", trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const specificationSubSchema = new Schema(
  {
    group: { type: String, default: "General", trim: true },
    name: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const supplierInfoSubSchema = new Schema(
  {
    name: { type: String, default: "", trim: true },
    sku: { type: String, default: "", trim: true },
    costPrice: {
      type: Number,
      default: null,
      min: [0, "Cost price cannot be negative"],
    },
    leadTimeDays: {
      type: Number,
      default: 3,
      min: [0, "Lead time cannot be negative"],
    },
  },
  { _id: false }
);

const shopProductSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      default: () => new mongoose.Types.ObjectId(),
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Product name cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      required: [true, "Product slug is required"],
      trim: true,
      lowercase: true,
    },
    sku: {
      type: String,
      required: [true, "Product SKU is required"],
      trim: true,
      uppercase: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "shop_category",
      required: [true, "Product category reference is required"],
      index: true,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Summary cannot exceed 500 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    images: {
      type: [imageSubSchema],
      default: [],
    },
    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: [0, "Selling price cannot be negative"],
      validate: {
        validator: Number.isFinite,
        message: "Selling price must be a valid finite number",
      },
    },
    originalPrice: {
      type: Number,
      default: null,
      min: [0, "Original price cannot be negative"],
      validate: {
        validator: (v) => v === null || v === undefined || Number.isFinite(v),
        message: "Original price must be a valid finite number",
      },
    },
    specifications: {
      type: [specificationSubSchema],
      default: [],
    },
    fulfillmentMode: {
      type: String,
      enum: {
        values: ["stock", "supplier_order"],
        message: "Fulfillment mode must be either 'stock' or 'supplier_order'",
      },
      default: "stock",
      required: true,
    },
    availabilityStatus: {
      type: String,
      enum: {
        values: ["in_stock", "available_on_order", "out_of_stock", "discontinued"],
        message: "Invalid availability status",
      },
      default: "in_stock",
      required: true,
    },
    stockQuantity: {
      type: Number,
      default: 0,
      min: [0, "Stock quantity cannot be negative"],
      validate: {
        validator: (v) => Number.isInteger(v) && v >= 0,
        message: "Stock quantity must be a non-negative integer",
      },
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: [0, "Reserved quantity cannot be negative"],
      validate: {
        validator: (v) => Number.isInteger(v) && v >= 0,
        message: "Reserved quantity must be a non-negative integer",
      },
    },
    supplierInfo: {
      type: supplierInfoSubSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: {
        values: ["draft", "published", "archived"],
        message: "Status must be 'draft', 'published', or 'archived'",
      },
      default: "draft",
      required: true,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    orderCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    embedImpressions: {
      type: Number,
      default: 0,
      min: 0,
    },
    embedClicks: {
      type: Number,
      default: 0,
      min: 0,
    },
    del_flag: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: availableQuantity = onHand (stockQuantity) - reservedQuantity
shopProductSchema.virtual("availableQuantity").get(function () {
  if (this.fulfillmentMode === "supplier_order") return 0;
  return Math.max(0, (this.stockQuantity || 0) - (this.reservedQuantity || 0));
});

// Pre-validate hook: Normalization & Business Rule Checks
shopProductSchema.pre("validate", function (next) {
  // 1. Slug normalization
  if (this.name && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  } else if (this.slug) {
    this.slug = slugify(this.slug, { lower: true, strict: true });
  }

  // 2. SKU normalization
  if (this.sku) {
    this.sku = this.sku.trim().toUpperCase();
  }

  // 3. Fulfillment mode and availability consistency checks
  if (this.fulfillmentMode === "stock") {
    // Invariant: reservedQuantity cannot exceed stockQuantity
    if (this.reservedQuantity > this.stockQuantity) {
      return next(new Error("Reserved quantity cannot exceed on-hand stock quantity"));
    }
    const available = (this.stockQuantity || 0) - (this.reservedQuantity || 0);
    if (available <= 0 && this.availabilityStatus === "in_stock") {
      this.availabilityStatus = "out_of_stock";
    }
  } else if (this.fulfillmentMode === "supplier_order") {
    // Supplier orders cannot claim instant in-stock delivery if not stocked
    if (this.availabilityStatus === "in_stock") {
      this.availabilityStatus = "available_on_order";
    }
  }

  next();
});

// Indexes for high performance querying
shopProductSchema.index({ category: 1, status: 1, del_flag: 1 });
shopProductSchema.index({ status: 1, del_flag: 1, createdAt: -1 });
shopProductSchema.index({ sellingPrice: 1, status: 1 });
shopProductSchema.index({ fulfillmentMode: 1, availabilityStatus: 1 });
shopProductSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { del_flag: 0 } }
);
shopProductSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { del_flag: 0 } }
);

module.exports = mongoose.model("shop_product", shopProductSchema);
