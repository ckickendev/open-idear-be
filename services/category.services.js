const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Category } = require("../models");
const { slugify } = require("slugify");

class CategoryService extends Service {
    async getAll() {
        const categories = await Category.find({});
        return categories;
    }

    async getRecentlyFeatures() {
        const categories = await Category.find({ del_flag: 0 }).sort({ createdAt: -1 }).limit(10);
        return categories;
    }

    async createCategory({ name, description }) {
        const category = new Category({
            _id: new mongoose.Types.ObjectId(),
            name, description,
            slug: slugify(name, {
                lower: true,
                strict: true,
            }),
        });
        await category.save();
        return category;
    }

    async updateCategory(id, { name, description }) {
        const category = await Category.findByIdAndUpdate(id, {
            name, description,
            slug: slugify(name, {
                lower: true,
                strict: true,
            }),
        }, { new: true });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        return category;
    }

    async deleteCategory(id) {
        const category = await Category.findByIdAndUpdate(id, { del_flag: 1 }, { new: true });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        return category;
    }

    async getRandomTopics(limit = 10, page = 1) {
        const skip = (page - 1) * limit;
        const categories = await Category.find({ del_flag: 0 })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        return categories;
    }
}

module.exports = new CategoryService();
