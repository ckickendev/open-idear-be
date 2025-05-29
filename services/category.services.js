const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Category } = require("../models");

class CategoryService extends Service {
    async getAll() {
        const categories = await Category.find({});
        return categories;
    }

    async createCategory({ name, description, slug }) {
        const category = new Category({
            _id: new mongoose.Types.ObjectId(),
            name, description, slug
        });
        await category.save();
        return category;
    }

    async updateCategory(id, { name, description, slug }) {
        const category = await Category.findByIdAndUpdate(id, { name, description, slug }, { new: true });
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
}

module.exports = new CategoryService();
