const mongoose = require("mongoose");
const slugify = require("slugify");
const { Service } = require("../core");
const { ShopCategory, ShopProduct } = require("../models");
const {
  BadRequestException,
  NotFoundException,
  ConflictException,
} = require("../exceptions");

class ShopCategoryService extends Service {
  /**
   * Create a new shop category.
   */
  async createCategory(data) {
    const {
      name,
      slug,
      description = "",
      image = null,
      parentCategory = null,
      displayOrder = 0,
      isActive = true,
    } = data;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new BadRequestException("Category name is required");
    }

    const normalizedSlug = slugify(slug || name, { lower: true, strict: true });
    if (!normalizedSlug) {
      throw new BadRequestException("Invalid category slug");
    }

    // Check slug uniqueness among active categories
    const existing = await ShopCategory.findOne({
      slug: normalizedSlug,
      del_flag: 0,
    });
    if (existing) {
      throw new ConflictException(`Category slug '${normalizedSlug}' is already in use`);
    }

    // Validate parent category if specified
    if (parentCategory) {
      if (!mongoose.Types.ObjectId.isValid(parentCategory)) {
        throw new BadRequestException("Invalid parent category ID");
      }
      const parent = await ShopCategory.findOne({
        _id: parentCategory,
        del_flag: 0,
      });
      if (!parent) {
        throw new NotFoundException("Parent category does not exist");
      }
    }

    const category = new ShopCategory({
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      slug: normalizedSlug,
      description: (description || "").trim(),
      image: image || null,
      parentCategory: parentCategory || null,
      displayOrder: Number(displayOrder) || 0,
      isActive: Boolean(isActive),
    });

    await category.save();
    return category;
  }

  /**
   * Get all active categories for the public catalog.
   */
  async getActiveCategoriesPublic() {
    const categories = await ShopCategory.find({
      isActive: true,
      del_flag: 0,
    })
      .select("_id name slug description image parentCategory displayOrder")
      .populate("parentCategory", "name slug")
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    return categories;
  }

  /**
   * Get all categories for administration with product counts.
   */
  async getAllCategoriesAdmin() {
    const categories = await ShopCategory.find({ del_flag: 0 })
      .populate("parentCategory", "name slug")
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    // Attach active product count per category
    const categoryIds = categories.map((c) => c._id);
    const productCounts = await ShopProduct.aggregate([
      {
        $match: {
          category: { $in: categoryIds },
          del_flag: 0,
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map();
    productCounts.forEach((pc) => {
      countMap.set(pc._id.toString(), pc.count);
    });

    return categories.map((cat) => ({
      ...cat,
      productCount: countMap.get(cat._id.toString()) || 0,
    }));
  }

  /**
   * Get category by ID.
   */
  async getCategoryById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid category ID format");
    }

    const category = await ShopCategory.findOne({ _id: id, del_flag: 0 })
      .populate("parentCategory", "name slug")
      .lean();

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }

  /**
   * Update category with allowlisted fields.
   */
  async updateCategory(id, updateData) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid category ID format");
    }

    const category = await ShopCategory.findOne({ _id: id, del_flag: 0 });
    if (!category) {
      throw new NotFoundException("Category not found");
    }

    // Handle slug change uniqueness
    if (updateData.slug || updateData.name) {
      const targetSlug = slugify(updateData.slug || updateData.name, {
        lower: true,
        strict: true,
      });

      if (targetSlug !== category.slug) {
        const existing = await ShopCategory.findOne({
          slug: targetSlug,
          _id: { $ne: id },
          del_flag: 0,
        });
        if (existing) {
          throw new ConflictException(`Category slug '${targetSlug}' is already in use`);
        }
        category.slug = targetSlug;
      }
    }

    if (updateData.name !== undefined) {
      category.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      category.description = updateData.description.trim();
    }
    if (updateData.image !== undefined) {
      category.image = updateData.image;
    }
    if (updateData.displayOrder !== undefined) {
      category.displayOrder = Number(updateData.displayOrder) || 0;
    }
    if (updateData.isActive !== undefined) {
      category.isActive = Boolean(updateData.isActive);
    }

    if (updateData.parentCategory !== undefined) {
      if (updateData.parentCategory === null || updateData.parentCategory === "") {
        category.parentCategory = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(updateData.parentCategory)) {
          throw new BadRequestException("Invalid parent category ID");
        }
        if (updateData.parentCategory.toString() === id.toString()) {
          throw new BadRequestException("Category cannot be its own parent");
        }
        const parent = await ShopCategory.findOne({
          _id: updateData.parentCategory,
          del_flag: 0,
        });
        if (!parent) {
          throw new NotFoundException("Parent category does not exist");
        }
        category.parentCategory = updateData.parentCategory;
      }
    }

    await category.save();
    return category;
  }

  /**
   * Safely soft-delete category without orphaning products or child categories.
   */
  async deleteCategory(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid category ID format");
    }

    const category = await ShopCategory.findOne({ _id: id, del_flag: 0 });
    if (!category) {
      throw new NotFoundException("Category not found");
    }

    // Check for active products
    const productCount = await ShopProduct.countDocuments({
      category: id,
      del_flag: 0,
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Cannot delete category with ${productCount} active product(s). Please reassign or delete products first.`
      );
    }

    // Check for child categories
    const childCount = await ShopCategory.countDocuments({
      parentCategory: id,
      del_flag: 0,
    });
    if (childCount > 0) {
      throw new ConflictException(
        `Cannot delete category with ${childCount} sub-category(ies). Please reassign sub-categories first.`
      );
    }

    category.del_flag = 1;
    await category.save();

    return { message: "Category deleted successfully", id };
  }
}

module.exports = new ShopCategoryService();
