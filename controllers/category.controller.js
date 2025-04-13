const express = require("express");
const { Controller } = require("../core");
const { categoryService } = require("../services")

class CategoryController extends Controller {
    _rootPath = "/Category";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const categories = await categoryService.getAllCategory();
        res.json({
            categories
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = CategoryController;
