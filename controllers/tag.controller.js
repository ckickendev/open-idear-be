const express = require("express");
const { Controller } = require("../core");
const { tagService } = require("../services")

class TagController extends Controller {
    _rootPath = "/tag";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const tags = await tagService.getAll();
        res.json({
            tags
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = TagController;
