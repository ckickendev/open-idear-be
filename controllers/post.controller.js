const express = require("express");
const { Controller } = require("../core");
const { postService, userService } = require("../services");
const { AuthMiddleware, LoginMiddleware, AdminMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class PostController extends Controller {
    _rootPath = "/post";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const posts = await postService.getAll();
        res.status(200).json({ posts });
    });

    getPost = asyncHandler(async (req, res) => {
        const { postId } = req.query;
        const { _id } = req.userInfo;

        const post = await postService.getPostById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author.toString() !== _id.toString())
            return res.status(403).json({ message: "You are not the author of this post" });

        res.status(200).json({ post });
    });

    getPostByID = asyncHandler(async (req, res) => {
        console.log('getPostByID');
        const { id } = req.params;
        const post = await postService.getPostById(id);
        if (!post) return res.status(404).json({ message: "Post not found" });
        res.status(200).json({ post });
    });

    getPostByAuthor = asyncHandler(async (req, res) => {
        console.log('getPostByAuthorrrrrr');
        const { _id } = req.userInfo;
        const posts = await postService.getPostByUser(_id);

        if (posts.length === 0)
            return res.status(404).json({ message: "Post not found" });

        res.status(200).json({ posts });
    });

    getLastestPostByUser = asyncHandler(async (req, res) => {
        const { userId } = req.body;
        const posts = await postService.getLastestPostByUser(userId);
        res.status(200).json({ posts });
    });

    create = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { title, content, text } = req.body;

        const user = await userService.findUserById(_id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const post = await postService.addPost({ content, author: _id, title, text });
        if (!post) return res.status(500).json({ message: "Error when creating post" });

        res.status(201).json({ message: "Post created successfully", post });
    });

    deletePost = asyncHandler(async (req, res) => {
        const { postId } = req.body;
        const { _id } = req.userInfo;

        const post = await postService.getPostById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author.toString() !== _id.toString())
            return res.status(403).json({ message: "You are not the author of this post" });

        await postService.deletePost(postId);
        res.status(200).json({ message: "Post deleted successfully" });
    });

    update = asyncHandler(async (req, res) => {
        const { postId, title, content, text } = req.body;
        
        const { _id } = req.userInfo;

        const post = await postService.getPostById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author.toString() !== _id.toString())
            return res.status(403).json({ message: "You are not the author of this post" });

        const updatedPost = await postService.updatePost(postId, { title, content, text });
        res.status(200).json({ message: "Post updated successfully", post: updatedPost });
    });

    updateStatus = asyncHandler(async (req, res) => {
        const id = req.params.id;
        const post = await postService.getPostById(id);
        if (!post) return res.status(404).json({ message: "Post not found" });

        await postService.updateStatusPost(id, post.published);
        res.status(200).json({ message: "Post status updated successfully" });
    });

    getLikeByUser = asyncHandler(async (req, res) => {
        console.log('getLikeByUser');
        
        const id = req.params.id;
        const posts = await postService.getPostLikeById(id);
        if (!posts || posts.length === 0)
            return res.status(404).json({ message: "Post not found" });

        res.status(200).json({ posts, message: "Get like success" });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.get(`${this._rootPath}/getPost`, AuthMiddleware, this.getPost);
        this._router.get(`${this._rootPath}/getPostByID`, this.getPostByID);
        this._router.get(`${this._rootPath}/getLastestPostByUser`, AuthMiddleware, this.getLastestPostByUser);
        this._router.get(`${this._rootPath}/getPostByAuthor`, AuthMiddleware, this.getPostByAuthor);
        this._router.get(`${this._rootPath}/getLikeByUser/:id`, this.getLikeByUser);
        this._router.post(`${this._rootPath}/create`, LoginMiddleware, AuthMiddleware, this.create);
        this._router.post(`${this._rootPath}/deletePost`, AuthMiddleware, this.deletePost);
        this._router.patch(`${this._rootPath}/update`, AuthMiddleware, this.update);
        this._router.patch(`${this._rootPath}/status/:id`, AdminMiddleware, this.updateStatus);
    };
}

module.exports = PostController;