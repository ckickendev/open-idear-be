const express = require("express");
const { Controller } = require("../core");
const { notificationService } = require("../services")

class NotificationController extends Controller {
    _rootPath = "/notification";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const notification = await notificationService.getAll();
        res.json({
            notification
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = NotificationController;
