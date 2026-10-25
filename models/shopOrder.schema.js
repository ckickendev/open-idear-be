// =============================================================================
//  OPENIDEAR SHOP — SHOP ORDER SCHEMA (SPRINT S3)
//  models/shopOrder.schema.js
// =============================================================================

const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "inquiry_received",
  "contacted",
  "awaiting_customer_confirmation",
  "confirmed",
  "cancelled",
  "completed",
];

const ALLOWED_TRANSITIONS = {
  inquiry_received: ["contacted", "cancelled"],
  contacted: ["awaiting_customer_confirmation", "cancelled"],
  awaiting_customer_confirmation: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  cancelled: [], // Terminal state
  completed: [], // Terminal state
};

const shopOrderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopProduct",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, "Unit price cannot be negative"],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      max: [50, "Quantity cannot exceed 50 units per inquiry"],
    },
    thumbnail: {
      type: String,
      default: null,
    },
    fulfillmentMode: {
      type: String,
      enum: ["stock", "supplier_order"],
      required: true,
    },
    supplierVerification: {
      verified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      supplierCostPrice: {
        type: Number,
        default: null,
        min: [0, "Supplier cost price cannot be negative"],
      },
      confirmedLeadTimeDays: {
        type: Number,
        default: null,
        min: [0, "Lead time cannot be negative"],
      },
      notes: {
        type: String,
        default: "",
        trim: true,
        maxlength: [500, "Notes cannot exceed 500 characters"],
      },
    },
  },
  { _id: false }
);

const shopOrderSchema = new mongoose.Schema(
  {
    orderReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    customer: {
      name: {
        type: String,
        required: [true, "Customer name is required"],
        trim: true,
        maxlength: [100, "Name cannot exceed 100 characters"],
      },
      contactMethod: {
        type: String,
        required: [true, "Contact method is required"],
        trim: true,
        maxlength: [100, "Contact method cannot exceed 100 characters"],
      },
      deliveryArea: {
        type: String,
        trim: true,
        default: "",
        maxlength: [200, "Delivery area cannot exceed 200 characters"],
      },
    },
    items: {
      type: [shopOrderItemSchema],
      required: true,
      validate: [
        (items) => items && items.length > 0,
        "Order must contain at least one item",
      ],
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, "Subtotal cannot be negative"],
    },
    currency: {
      type: String,
      default: "VND",
      uppercase: true,
    },
    customerNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Customer note cannot exceed 1000 characters"],
    },
    adminNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Admin note cannot exceed 2000 characters"],
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "inquiry_received",
      required: true,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: ORDER_STATUSES,
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        note: {
          type: String,
          default: "",
        },
      },
    ],
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
      index: true,
    },
    idempotencyPayloadHash: {
      type: String,
      trim: true,
      default: null,
    },
    inventoryReserved: {
      type: Boolean,
      default: false,
      index: true,
    },
    inventoryFulfilled: {
      type: Boolean,
      default: false,
    },
    reservationExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },
    attribution: {
      type: new mongoose.Schema(
        {
          articleId: { type: String, trim: true, default: null },
          articleSlug: { type: String, trim: true, default: null },
          embedId: { type: String, trim: true, default: null },
          source: { type: String, trim: true, default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
    del_flag: {
      type: Number,
      default: 0,
      enum: [0, 1],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for fast lookup and dashboard filtering
shopOrderSchema.index({ status: 1, del_flag: 1, createdAt: -1 });
shopOrderSchema.index({ "customer.contactMethod": 1, del_flag: 1 });

module.exports = {
  ShopOrder: mongoose.model("ShopOrder", shopOrderSchema, "ShopOrder"),
  ORDER_STATUSES,
  ALLOWED_TRANSITIONS,
};
