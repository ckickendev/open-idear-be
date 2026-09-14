const express = require("express");
const { Controller } = require("../core");
const { paymentService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

class PaymentController extends Controller {
    _rootPath = "";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    createCheckout = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { gateway } = req.body; // "demo" | "payos"
        const payment = await paymentService.createCheckout(_id, gateway || "demo");
        res.status(201).json({ status: "success", data: payment });
    });

    processDemoPayment = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { paymentId } = req.body;
        if (!paymentId) {
            return res.status(400).json({ status: "error", error: "paymentId is required" });
        }
        const result = await paymentService.processDemoPayment(paymentId, _id);
        res.status(200).json({ status: "success", data: result });
    });

    /**
     * payOS webhook endpoint — NO auth middleware.
     * payOS sends POST requests directly to this URL when payment status changes.
     * Must always return 2xx to acknowledge receipt.
     */
    payosWebhook = async (req, res) => {
        try {
            const result = await paymentService.processPayosWebhook(req.body);
            res.status(200).json({ success: true, data: result });
        } catch (error) {
            console.error("[payOS Webhook] Error:", error.message);
            // Always return 200 to payOS to prevent retries for handled errors
            res.status(200).json({ success: false, error: error.message });
        }
    };

    /**
     * Check payment status by payOS orderCode (used by frontend after redirect)
     */
    getPaymentStatus = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { orderCode } = req.params;
        const payment = await paymentService.getPaymentByOrderCode(orderCode, _id);
        res.status(200).json({ status: "success", data: payment });
    });

    initController = () => {
        this._router.post("/checkout/create", AuthMiddleware, this.createCheckout);
        this._router.post("/payment/demo-success", AuthMiddleware, this.processDemoPayment);
        this._router.post("/payment/payos-webhook", this.payosWebhook);
        this._router.get("/payment/status/:orderCode", AuthMiddleware, this.getPaymentStatus);
    };
}

module.exports = PaymentController;

