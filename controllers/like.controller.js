const express = require("express");
const { Controller } = require("../core");
const { likeService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class LikeController extends Controller {
    _rootPath = "/like";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAllLikeInPost = asyncHandler(async (req, res) => {
        const { postId } = req.query;

        if (!postId) {
            return res.status(400).json({ error: "postId is required" });
        }

        const likes = await likeService.getAllLikeInPost(postId);
        res.json({ likes });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAllLikeInPost);
    };
}

module.exports = LikeController;