const { Service } = require("../core");
const { Post } = require("../models");

class PostService extends Service {
    async getAll() {
        const posts = await Post.find({});
        return posts;
    }
}

module.exports = new PostService();
