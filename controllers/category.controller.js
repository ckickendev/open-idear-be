const express = require("express");
const { Controller } = require("../core");
const { categorieService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class CategoryController extends Controller {
    _rootPath = "/category";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const categories = await categorieService.getAll();
        res.json({ categories });
    });

    getRandomTopic = asyncHandler(async (req, res) => {
        const { limit = 10, page = 1 } = req.query;
        const categories = await categorieService.getRandomTopics(limit, page);
        if (categories.length === 0) {
            return res.status(404).json({ message: "No categories found" });
        }
        res.json({
            success: true,
            topic: categories,
            pagination: {
                currentPage: parseInt(page),
                totalCategories: categories.length,
                totalPages: Math.ceil(categories.length / limit),
            },
        });
    });

    getCategoryBySlug = asyncHandler(async (req, res) => {
        const { slug } = req.params;
        if (!slug) {
            return res.status(400).json({ message: "Slug is required" });
        }

        const category = await categorieService.getCategoryBySlug(slug);
        console.log("getCategoryBySlug category:", category);

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json({ category });
    });

    getPostsByCategorySlug = asyncHandler(async (req, res) => {
        const { slug, page } = req.params;
        if (!slug) {
            return res.status(400).json({ message: "Slug is required" });
        }

        const posts = await categorieService.getPostsByCategorySlug(slug, page);
        if (!posts) {
            return res.status(404).json({ message: "No posts found for this category" });
        }

        res.json({ posts });
    });

    getPostsInAnotherCategorySlug = asyncHandler(async (req, res) => {
        const { slug, number } = req.params;
        if (!slug) {
            return res.status(400).json({ message: "Slug is required" });
        }
        const posts = await categorieService.getPostsInAnotherCategorySlug(slug, number);
        if (!posts) {
            return res.status(404).json({ message: "No posts found for this category" });
        }
        res.json({ posts });
    });

    createCategory = asyncHandler(async (req, res) => {
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ message: "Name and description are required" });
        }

        const category = await categorieService.createCategory({ name, description });
        res.status(201).json({
            message: "Category created successfully",
            category,
        });
    });

    updateCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, description } = req.body;
        if (!name || !description) {
            return res.status(400).json({ message: "Name and description are required" });
        }

        const category = await categorieService.updateCategory(id, { name, description });
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json({
            message: "Category updated successfully",
            category,
        });
    });

    deleteCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const category = await categorieService.deleteCategory(id);

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json({
            message: "Category deleted successfully",
            category,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.get(`${this._rootPath}/getRandomTopic`, this.getRandomTopic);
        this._router.get(`${this._rootPath}/getCategoryBySlug/:slug`, this.getCategoryBySlug);
        this._router.get(`${this._rootPath}/getPostsByCategorySlug/:slug/:page`, this.getPostsByCategorySlug);
        this._router.get(`${this._rootPath}/getPostsInAnotherCategorySlug/:slug/:number`, this.getPostsInAnotherCategorySlug);
        this._router.post(`${this._rootPath}/create`, AdminMiddleware, this.createCategory);
        this._router.patch(`${this._rootPath}/update/:id`, AdminMiddleware, this.updateCategory);
        this._router.delete(`${this._rootPath}/delete/:id`, AdminMiddleware, this.deleteCategory);
    };
}

module.exports = CategoryController;