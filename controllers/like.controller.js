const express = require("express");
const { Controller } = require("../core");
const { likeService } = require("../services")

class LikeController extends Controller {
    _rootPath = "/like";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAllLikeInPost(req, res, next) {
        const postId = req.query.postId;
        if (!postId) {
            return res.status(400).json({ error: "postId is required" });
        }
        const likes = await likeService.getAllLikeInPost(postId);
        res.json({
            likes
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAllLikeInPost);
    };
}

module.exports = LikeController;
