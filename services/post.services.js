const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Post } = require("../models");

class PostService extends Service {
    async getAll() {
        const posts = await Post.find({});
        return posts;
    }

    async getLastestPostByUser(userId) {
        const posts = await Post.find({ userId }).sort({ createdAt: -1 }).limit(5);
        return posts;
    }

    async addPost(post) {
        const slug = this.slugify(post.title);
        const newPost = new Post({
            _id: new mongoose.Types.ObjectId(),
            title: post.title,
            content: post.content,
            author: post.author,
            slug
        });
        const returnPost = await Post.create(newPost);
        return returnPost;
    }

    async getPostById(postId) {
        const post = await Post.findById(postId);
        if (!post) {
            return null;
        }
        return post;
    }

    async updatePost(postId, post) {
        const updatedPost = await Post.findByIdAndUpdate(postId, {
            title: post.title,
            content: post.content,
        }, { new: true });
        return updatedPost;
    }

    slugify(str) {
        str = str.replace(/^\s+|\s+$/g, ''); // trim leading/trailing white space
        str = str.toLowerCase(); // convert string to lowercase
        str = str.replace(/[^a-z0-9 -]/g, '') // remove any non-alphanumeric characters
            .replace(/\s+/g, '-') // replace spaces with hyphens
            .replace(/-+/g, '-'); // remove consecutive hyphens
        return str;
    }

}

module.exports = new PostService();
