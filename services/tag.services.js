const { Service } = require("../core");
const { Tag } = require("../models");

class TagService extends Service {
    async getAll() {
        const tags = await Tag.find({});
        return tags;
    }
}

module.exports = new TagService();
