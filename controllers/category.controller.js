const express = require("express");
const { Controller } = require("../core");
const { categorieService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");

class CategoryController extends Controller {
    _rootPath = "/category";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const categories = await categorieService.getAll();
        res.json({
            categories
        })
    }

    async createCategory(req, res, next) {
        const { name, description, slug } = req.body;
        if (!name || !description) {
            return res.status(400).json({ message: "Name and description are required" });
        }
        try {
            const category = await categorieService.createCategory({ name, description, slug });
            res.status(201).json({
                message: "Category created successfully",
                category
            });
        } catch (error) {
            console.error("Error creating category:", error);
            res.status(500).json({ message: "Internal server error" });
        }
        
    }

    async updateCategory(req, res, next) {
        const { id } = req.params;
        const { name, description, slug } = req.body;
        if (!name || !description) {
            return res.status(400).json({ message: "Name and description are required" });
        }
        const category = await categorieService.updateCategory(id, { name, description, slug });
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }
        res.json({
            message: "Category updated successfully",
            category
        });
    }

    async deleteCategory(req, res, next) {
        const { id } = req.params;
        const category = await categorieService.deleteCategory(id);
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }
        res.json({
            message: "Category deleted successfully",
            category
        });
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.post(`${this._rootPath}/create`, AdminMiddleware, this.createCategory);
        this._router.patch(`${this._rootPath}/update/:id`, AdminMiddleware, this.updateCategory);
        this._router.delete(`${this._rootPath}/delete/:id`, AdminMiddleware, this.deleteCategory);
    };
}

module.exports = CategoryController;
