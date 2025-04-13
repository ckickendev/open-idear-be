const { Service } = require("../core");
const { Like } = require("../models");

class LikeService extends Service {
    async getAllLikeInPost(post) {
        const posts = await Like.find({ post: post });
        return posts;
    }
}

module.exports = new LikeService();
