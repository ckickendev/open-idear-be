const express = require("express");
const { Controller } = require("../core");
const { subService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class SubController extends Controller {
    _rootPath = "/sub";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const subs = await subService.getAll();
        res.status(200).json({
            status: "success",
            data: subs,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = SubController;