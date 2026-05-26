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
        const payment = await paymentService.createCheckout(_id);
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

    initController = () => {
        this._router.post("/checkout/create", AuthMiddleware, this.createCheckout);
        this._router.post("/payment/demo-success", AuthMiddleware, this.processDemoPayment);
    };
}

module.exports = PaymentController;
