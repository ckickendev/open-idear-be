const mongoose = require("mongoose");
const slugify = require("slugify");

const { Schema } = mongoose;

const shopCategorySchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      default: () => new mongoose.Types.ObjectId(),
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Category slug is required"],
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    image: {
      type: String,
      default: null,
      trim: true,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "shop_category",
      default: null,
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: [0, "Display order cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    del_flag: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Slug normalization pre-validate hook
shopCategorySchema.pre("validate", function (next) {
  if (this.name && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  } else if (this.slug) {
    this.slug = slugify(this.slug, { lower: true, strict: true });
  }
  next();
});

// Performance & Filtering Indexes
shopCategorySchema.index({ isActive: 1, del_flag: 1, displayOrder: 1 });
shopCategorySchema.index({ parentCategory: 1, del_flag: 1 });
shopCategorySchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { del_flag: 0 } }
);

module.exports = mongoose.model("shop_category", shopCategorySchema);
