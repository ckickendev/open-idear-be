const express = require("express");
const { Controller } = require("../core");
const { cartService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

class CartController extends Controller {
    _rootPath = "/cart";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getCart = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const result = await cartService.getCart(_id);
        res.status(200).json({ status: "success", data: result });
    });

    addToCart = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { courseId } = req.body;
        if (!courseId) {
            return res.status(400).json({ status: "error", error: "courseId is required" });
        }
        const result = await cartService.addToCart(_id, courseId);
        res.status(200).json({ status: "success", data: result });
    });

    removeFromCart = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { courseId } = req.body;
        if (!courseId) {
            return res.status(400).json({ status: "error", error: "courseId is required" });
        }
        const result = await cartService.removeFromCart(_id, courseId);
        res.status(200).json({ status: "success", data: result });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, AuthMiddleware, this.getCart);
        this._router.post(`${this._rootPath}/add`, AuthMiddleware, this.addToCart);
        this._router.delete(`${this._rootPath}/remove`, AuthMiddleware, this.removeFromCart);
    };
}

module.exports = CartController;
