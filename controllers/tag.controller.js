const express = require("express");
const { Controller } = require("../core");
const { tagService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class TagController extends Controller {
    _rootPath = "/tag";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const tags = await tagService.getAll();
        res.status(200).json({
            status: "success",
            data: tags,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = TagController;