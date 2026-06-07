const express = require("express");
const { Controller } = require("../core");
const { commentService, postService } = require("../services");
const { Comment, Post } = require("../models"); 
const asyncHandler = require("../utils/asyncHandler");
const { loadMoreReplies } = require("../utils/parseComment");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

class CommentController extends Controller {
  _rootPath = "/comments";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  getAll = asyncHandler(async (req, res) => {
    const comments = await commentService.getAll();
    res.json({ comments });
  });

  async createComment(req, res) {
    try {
      const { content, postId, parentCommentId = null } = req.body;
      const userId = req.userInfo._id; // From auth middleware

      // Validate parent comment if replying
      let level = 0;
      if (parentCommentId) {
        const parentComment = await commentService.findCommentById(parentCommentId);
        if (!parentComment) {
          return res.status(404).json({
            success: false,
            error: "Parent comment not found",
          });
        }
        level = parentComment.level + 1;

        if (level > 10) {
          return res.status(400).json({
            success: false,
            error: "Maximum nesting level reached",
          });
        }
      }

      const parsedComment = await commentService.createComment({content, userId, postId, parentCommentId, level})

      res.status(201).json({
        success: true,
        data: parsedComment,
      });
    } catch (error) {
      console.log(error.message);
      
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 2. Get comments for a post (with nested structure)
  async getPostComments(req, res) {
    
    try {
      const {
        postId,
        method = "paginated", // 'recursive', 'flat', 'paginated'
        page = 1,
        limit = 10,
        sort = "hot", // 'hot', 'new', 'old'
      } = req.query;

      let result;

      switch (method) {
        case "recursive":
          // Best for small datasets, full tree structure
          result = await commentService.parseCommentsRecursive(postId);
          break;

        case "flat":
          // Best for simple rendering, all comments in flat array
          result = await commentService.parseCommentsFlat(
            postId,
            parseInt(page),
            parseInt(limit)
          );
          break;

        case "paginated":
        default:
          // Best for performance, load replies on demand
          result = await commentService.parseCommentsPaginated(
            postId,
            parseInt(page),
            parseInt(limit)
          );
          break;
      }

      // console.log(result);
      res.json({
        success: true,
        data: result,
        method: method,
      });
    } catch (error) {
      console.log(error);
      
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getMoreReplies(req, res) {
    try {
      const { commentId } = req.params;
      const { skip = 0, limit = 5 } = req.query;

      const result = await loadMoreReplies(
        commentId,
        parseInt(skip),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }



  // 3. Vote on a comment
  async voteComment(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.userInfo._id;

      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      let hasVote;

      // Remove existing votes
      if(comment.upvotes.includes(userId)) {
        comment.upvotes.pull(userId);
        hasVote = false;
      } else {
        comment.upvotes.push(userId);
        hasVote = true;
      }

      await comment.save();

      res.json({
        score: comment.score,
        userVote: hasVote,
        upvotes: comment.upvotes
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async voteLike(req, res) {
    try {
      const { postId } = req.params;
      const userId = req.userInfo._id;

      const postLike = await commentService.voteLike(postId, userId)

      res.json({
        postLike
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }


  // 4. Delete a comment (soft delete)
  async deleteComment(req, res) {
    try {
      const commentId = req.params.commentId || req.body.commentId || req.query.commentId;
      const userId = req.userInfo._id;

      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      // Check if user owns the comment
      if (comment.author.toString() !== userId.toString()) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Soft delete
      comment.del_flag = 1;
      comment.content = "[deleted]";
      await comment.save();

      res.json({ message: "Comment deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  initController = () => {
    this._router.get(`${this._rootPath}`, this.getAll);
    this._router.get(`${this._rootPath}/getPostComments`, this.getPostComments);
    this._router.post(`${this._rootPath}/createComment`, AuthMiddleware, this.createComment);
    this._router.post(`${this._rootPath}/vote/:commentId`, AuthMiddleware, this.voteComment);
    this._router.post(`${this._rootPath}/voteLike/:postId`, AuthMiddleware, this.voteLike);
    this._router.delete(`${this._rootPath}/deleteComment`, AuthMiddleware, this.deleteComment);
  };
}

module.exports = CommentController;