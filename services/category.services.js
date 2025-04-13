const { Service } = require("../core");
const { Category } = require("../models");

class CategoryService extends Service {
    async getAll() {
        const categories = await Category.find({});
        return categories;
    }
}

module.exports = new CategoryService();
