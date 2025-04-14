const express = require("express");
const { Controller } = require("../core");
const { commentService } = require("../services")

class CategoryController extends Controller {
    _rootPath = "/comment";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const comments = await commentService.getAll();
        res.json({
            comments
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = CategoryController;
