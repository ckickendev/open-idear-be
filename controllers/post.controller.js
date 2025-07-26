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
        console.log('Call function get all');

        const posts = await postService.getAll();
        res.status(200).json({ posts });
    });

    getPostToEdit = asyncHandler(async (req, res) => {
        console.log('Call function get post');
        const { postId } = req.query;
        const { _id } = req.userInfo;

        const post = await postService.getPostById(postId);
        
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author._id.toString() !== _id.toString())
            return res.status(403).json({ message: "You are not the author of this post" });

        res.status(200).json({ post });
    });

    getPostByID = asyncHandler(async (req, res) => {
        console.log('Call function get post by ID');
        const { id } = req.params;

        const post = await postService.getPostById(id);
        
        if (!post) return res.status(404).json({ message: "Post not found" });
        res.status(200).json({ post });
    });

    getHotTopics = asyncHandler(async (req, res) => {
        console.log('Call function get hot topics');
        const { limit = 10, page = 1 } = req.query;
        const posts = await postService.getHotPostsToday(limit, page);
        if (posts.length === 0) return res.status(404).json({ message: "No hot topics found" });

        res.json({
            success: true,
            data: posts,
            pagination: {
                currentPage: parseInt(page),
                totalPosts: posts.length,
                totalPages: Math.ceil(posts.length / limit),
                hasNext: skip + parseInt(limit) < posts.length,
                hasPrev: page > 1
            }
        });
    });

    getPostByAuthor = asyncHandler(async (req, res) => {
        console.log('getPostByAuthor');
        const { _id } = req.userInfo;
        const posts = await postService.getPostByUser(_id);

        if (posts.length === 0)
            return res.status(404).json({ message: "Post not found" });

        res.status(200).json({ posts });
    });

    getLastestPostByUser = asyncHandler(async (req, res) => {
        console.log('Call function get lastest post by user');
        const { userId } = req.body;
        const posts = await postService.getLastestPostByUser(userId);
        res.status(200).json({ posts });
    });

    create = asyncHandler(async (req, res) => {
        console.log('Call function create Post');
        const { _id } = req.userInfo;
        const { title, content, text } = req.body;

        const user = await userService.findUserById(_id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const post = await postService.addPost({ content, author: _id, title, text });
        if (!post) return res.status(500).json({ message: "Error when creating post" });

        res.status(201).json({ message: "Post created successfully", post });
    });

    deletePost = asyncHandler(async (req, res) => {
        console.log('Call function deletePost');
        const { postId } = req.body;
        const { _id } = req.userInfo;

        const post = await postService.getPostById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author._id.toString() !== _id.toString())
            return res.status(403).json({ message: "You are not the author of this post" });

        await postService.deletePost(postId);
        res.status(200).json({ message: "Post deleted successfully" });
    });
    
    public = asyncHandler(async (req, res) => {
        console.log('Call function public post');
        const publicInfo = req.body.publicInfo;
        const { _id } = req.userInfo;
        const post = await postService.getPostById(publicInfo.postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author._id.toString() !== _id.toString())
            return res.status(403).json({ message: "You are not the author of this post" });

        const updatedPost = await postService.publicPost(publicInfo.postId, publicInfo);

        res.status(200).json({ message: "Post published successfully", post: updatedPost });
    });

    update = asyncHandler(async (req, res) => {
        const { postId, title, content, text } = req.body;
        
        const { _id } = req.userInfo;

        const post = await postService.getPostById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author._id.toString() !== _id.toString())
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
        console.log('Call function getLikeByUser');

        const { _id } = req.userInfo;
        const likePost = await postService.getPostLikeById(_id);

        res.status(200).json({ likePost, message: "Get like success" });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.get(`${this._rootPath}/getPostToEdit`, AuthMiddleware, this.getPostToEdit);
        this._router.get(`${this._rootPath}/getPostByID/:id`, this.getPostByID);
        this._router.get(`${this._rootPath}/getHotTopics`, this.getHotTopics);
        this._router.get(`${this._rootPath}/getHotPostsToday`, this.getHotTopics);
        this._router.get(`${this._rootPath}/getLastestPostByUser`, AuthMiddleware, this.getLastestPostByUser);
        this._router.get(`${this._rootPath}/getPostByAuthor`, AuthMiddleware, this.getPostByAuthor);
        this._router.get(`${this._rootPath}/getLikeByUser`, AuthMiddleware, this.getLikeByUser);
        this._router.post(`${this._rootPath}/create`, LoginMiddleware, AuthMiddleware, this.create);
        this._router.post(`${this._rootPath}/deletePost`, AuthMiddleware, this.deletePost);
        this._router.post(`${this._rootPath}/public`, AuthMiddleware, this.public);
        this._router.patch(`${this._rootPath}/update`, AuthMiddleware, this.update);
        this._router.patch(`${this._rootPath}/status/:id`, AdminMiddleware, this.updateStatus);
    };
}

module.exports = PostController;