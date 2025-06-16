const express = require("express");
const { Controller } = require("../core");
const { commentService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class CommentController extends Controller {
    _rootPath = "/comment";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const comments = await commentService.getAll();
        res.json({ comments });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = CommentController;