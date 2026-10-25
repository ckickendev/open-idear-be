const express = require("express");
const { Controller } = require("../core");
const { shopCategoryService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class ShopCategoryController extends Controller {
  _rootPath = "/shop/categories";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  createCategory = asyncHandler(async (req, res) => {
    const category = await shopCategoryService.createCategory(req.body);
    res.status(201).json({
      status: "success",
      message: "Category created successfully",
      data: category,
    });
  });

  getAllCategoriesAdmin = asyncHandler(async (req, res) => {
    const categories = await shopCategoryService.getAllCategoriesAdmin();
    res.json({
      status: "success",
      data: categories,
    });
  });

  getCategoryById = asyncHandler(async (req, res) => {
    const category = await shopCategoryService.getCategoryById(req.params.id);
    res.json({
      status: "success",
      data: category,
    });
  });

  updateCategory = asyncHandler(async (req, res) => {
    const category = await shopCategoryService.updateCategory(
      req.params.id,
      req.body
    );
    res.json({
      status: "success",
      message: "Category updated successfully",
      data: category,
    });
  });

  deleteCategory = asyncHandler(async (req, res) => {
    const result = await shopCategoryService.deleteCategory(req.params.id);
    res.json({
      status: "success",
      message: result.message,
    });
  });

  getActiveCategoriesPublic = asyncHandler(async (req, res) => {
    const categories = await shopCategoryService.getActiveCategoriesPublic();
    res.json({
      status: "success",
      data: categories,
    });
  });

  initController = () => {
    // Admin routes (guarded by AdminMiddleware)
    this._router.post(
      `${this._rootPath}`,
      AdminMiddleware,
      this.createCategory
    );
    this._router.get(
      `${this._rootPath}/admin`,
      AdminMiddleware,
      this.getAllCategoriesAdmin
    );
    this._router.get(
      `${this._rootPath}/admin/:id`,
      AdminMiddleware,
      this.getCategoryById
    );
    this._router.patch(
      `${this._rootPath}/:id`,
      AdminMiddleware,
      this.updateCategory
    );
    this._router.delete(
      `${this._rootPath}/:id`,
      AdminMiddleware,
      this.deleteCategory
    );

    // Public catalog route (read active only)
    this._router.get(`${this._rootPath}`, this.getActiveCategoriesPublic);
  };
}

module.exports = ShopCategoryController;
