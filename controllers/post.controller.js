const express = require("express");
const { Controller } = require("../core");
const { postService, userService } = require("../services");
const { AuthMiddleware, LoginMiddleware } = require("../middlewares/auth.middleware");

class PostController extends Controller {
    _rootPath = "/post";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const posts = await postService.getAll();
        res.json({
            posts
        })
    }

    async getPostById(req, res, next) {
        const { postId } = req.query;
        const { _id } = req.userInfo;
        console.log('postId', postId);

        const post = await postService.getPostById(postId);
        if (!post) {
            return res.status(404).json({
                message: "Post not found"
            })
        }

        if (post.author.toString() !== _id.toString()) {
            return res.status(403).json({
                message: "You are not the author of this post"
            })
        }

        res.json({
            post
        })
    }

    async getPostByAuthor(req, res, next) {
        const { _id } = req.userInfo;
        console.log('_id', _id);
        try {
            const posts = await postService.getPostByUser(_id);

            if (posts.length === 0) {
                return res.status(404).json({
                    message: "Post not found"
                })
            }
            res.json({
                posts
            })
        } catch (error) {
            res.status(404).json({ error: error.message });
        }

    }

    async getLastestPostByUser(req, res, next) {
        const { userId } = req.body;
        const posts = await postService.getLastestPostByUser(userId);
        res.json({
            posts
        })
    }

    async create(req, res, next) {
        console.log('req.userInfo', req.userInfo);

        const { _id } = req.userInfo;
        const { title, content } = req.body;
        const user = userService.findUserById(_id);
        if (!user) {
            return res.status(404).json({
                message: "User not found"
            })
        }

        const post = await postService.addPost({
            content,
            author: _id,
            title
        });
        if (!post) {
            return res.status(500).json({
                message: "Error when creating post"
            })
        } else {
            res.json({
                message: "Post created successfully",
                post
            })
        }
    }

    async deletePost(req, res, next) {
        const { postId } = req.body;
        const { _id } = req.userInfo;
        const post = await postService.getPostById(postId);
        if (!post) {
            return res.status(404).json({
                message: "Post not found"
            })
        }
        if (post.author.toString() !== _id.toString()) {
            return res.status(403).json({
                message: "You are not the author of this post"
            })
        }
        await postService.deletePost(postId);
        res.json({
            message: "Post deleted successfully"
        })
    }

    async update(req, res, next) {
        const { postId, title, content } = req.body;
        const { _id } = req.userInfo;
        const post = await postService.getPostById(postId);
        if (!post) {
            return res.status(404).json({
                message: "Post not found"
            })
        }
        if (post.author.toString() !== _id.toString()) {
            return res.status(403).json({
                message: "You are not the author of this post"
            })
        }
        const updatedPost = await postService.updatePost(postId, {
            title,
            content
        });
        res.json({
            message: "Post updated successfully",
            post: updatedPost
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.get(`${this._rootPath}/getPost`, AuthMiddleware, this.getPostById);
        this._router.get(`${this._rootPath}/getLastestPostByUser`, AuthMiddleware, this.getLastestPostByUser);
        this._router.get(`${this._rootPath}/getPostByAuthor`, AuthMiddleware, this.getPostByAuthor);
        this._router.post(`${this._rootPath}/create`, LoginMiddleware, AuthMiddleware, this.create);
        this._router.post(`${this._rootPath}/deletePost`, AuthMiddleware, this.deletePost);
        this._router.patch(`${this._rootPath}/update`, AuthMiddleware, this.update);
    };
}

module.exports = PostController;
