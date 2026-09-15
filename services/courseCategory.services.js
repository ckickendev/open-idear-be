const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { CourseCategory } = require("../models");
const { default: slugify } = require("slugify");
const { NotFoundException } = require("../exceptions");

class CourseCategoryService extends Service {
  async getAll() {
    return CourseCategory.find({ del_flag: { $ne: 1 } }).sort({ createdAt: -1 });
  }

  async createCourseCategory({ name, description, background_image, slug }) {
    const categorySlug = slug || slugify(name, { lower: true, strict: true });
    const category = new CourseCategory({
      _id: new mongoose.Types.ObjectId(),
      name,
      slug: categorySlug,
      description: description || "",
      background_image: background_image || "",
    });
    await category.save();
    return category;
  }

  async updateCourseCategory(id, { name, description, background_image, slug }) {
    const updateData = {};
    if (name !== undefined) {
      updateData.name = name;
      updateData.slug = slug || slugify(name, { lower: true, strict: true });
    }
    if (description !== undefined) updateData.description = description;
    if (background_image !== undefined) updateData.background_image = background_image;

    const category = await CourseCategory.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    if (!category) {
      throw new NotFoundException("Course category not found");
    }
    return category;
  }

  async deleteCourseCategory(id) {
    const category = await CourseCategory.findByIdAndUpdate(
      id,
      { del_flag: 1 },
      { new: true }
    );
    if (!category) {
      throw new NotFoundException("Course category not found");
    }
    return category;
  }
}

module.exports = new CourseCategoryService();
