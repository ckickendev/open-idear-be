const express = require("express");
const { Controller } = require("../core");
const { mediaService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class MediaController extends Controller {
    _rootPath = "/media";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const mediaList = await mediaService.getAll();
        res.json({
            status: "success",
            data: mediaList,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = MediaController;