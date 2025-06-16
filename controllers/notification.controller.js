const express = require("express");
const { Controller } = require("../core");
const { notificationService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class NotificationController extends Controller {
    _rootPath = "/notification";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const notifications = await notificationService.getAll();
        res.status(200).json({
            status: "success",
            data: notifications,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = NotificationController;