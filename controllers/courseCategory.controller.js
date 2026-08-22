const express = require("express");
const { Controller } = require("../core");
const { courseCategoryService } = require("../services");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class CourseCategoryController extends Controller {
  _rootPath = "/courseCategory";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  getAll = asyncHandler(async (req, res) => {
    const categories = await courseCategoryService.getAll();
    res.status(200).json({ categories });
  });

  createCourseCategory = asyncHandler(async (req, res) => {
    const { name, description, background_image, slug } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const category = await courseCategoryService.createCourseCategory({
      name: name.trim(),
      description: description ? description.trim() : "",
      background_image,
      slug,
    });
    res.status(201).json({
      message: "Course category created successfully",
      category,
    });
  });

  updateCourseCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, background_image, slug } = req.body;

    const category = await courseCategoryService.updateCourseCategory(id, {
      name: name ? name.trim() : undefined,
      description: description !== undefined ? description.trim() : undefined,
      background_image,
      slug,
    });

    res.status(200).json({
      message: "Course category updated successfully",
      category,
    });
  });

  deleteCourseCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await courseCategoryService.deleteCourseCategory(id);

    res.status(200).json({
      message: "Course category deleted successfully",
      category,
    });
  });

  initController = () => {
    this._router.get(`${this._rootPath}`, this.getAll);
    this._router.post(`${this._rootPath}/create`, AuthMiddleware, this.createCourseCategory);
    this._router.patch(`${this._rootPath}/update/:id`, AuthMiddleware, this.updateCourseCategory);
    this._router.delete(`${this._rootPath}/delete/:id`, AuthMiddleware, this.deleteCourseCategory);
  };
}

module.exports = CourseCategoryController;
