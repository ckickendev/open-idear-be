const mongoose = require("mongoose");

const { Schema } = mongoose;
const paymentSchema = new Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "course" }],
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: "VND" },
        status: {
            type: String,
            enum: ["pending", "paid", "failed", "refunded"],
            default: "pending",
        },
        paymentMethod: { type: String, default: "demo" },
        paymentGateway: {
            type: String,
            enum: ["demo", "stripe", "vnpay", "momo"],
            default: "demo",
        },
        transactionId: { type: String, default: null },
        gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },
        couponCode: { type: String, default: null },
        affiliateCode: { type: String, default: null },
        paidAt: { type: Date, default: null },
    },
    {
        timestamps: true,
    }
);

paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ transactionId: 1 });

module.exports = mongoose.model("payment", paymentSchema);
