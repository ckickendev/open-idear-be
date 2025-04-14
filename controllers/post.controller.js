const express = require("express");
const { Controller } = require("../core");
const { postService } = require("../services")

class PostController extends Controller {
    _rootPath = "/post";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const posts = await postService.getAll();
        res.json({
            posts
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = PostController;
