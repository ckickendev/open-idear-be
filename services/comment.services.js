const { Service } = require("../core");
const { Comment } = require("../models");

class CommentService extends Service {
    async getAll() {
        const comments = await Comment.find({});
        return comments;
    }
}

module.exports = new CommentService();
