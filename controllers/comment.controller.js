const express = require("express");
const { Controller } = require("../core");
const { commentService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { parseNewComment, loadMoreReplies } = require("../utils/parseComment");

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
      const userId = req.user.id; // From auth middleware

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

      // Create comment
      const comment = new Comment({
        content,
        author: userId,
        post: postId,
        parentComment: parentCommentId,
        level,
      });

      await comment.save();

      // Update relationships
      if (parentCommentId) {
        await Comment.findByIdAndUpdate(parentCommentId, {
          $push: { replies: comment._id },
          $inc: { totalReplies: 1 },
        });
      }

      await Post.findByIdAndUpdate(postId, {
        $push: { comments: comment._id },
      });

      // Get populated comment data
      const populatedComment = await commentService.findCommentById(comment._id)

      // Parse for client consumption
      const parsedComment = parseNewComment(populatedComment);

      // TODO: Emit to WebSocket for real-time updates
      // io.to(`post_${postId}`).emit('new_comment', parsedComment);

      res.status(201).json({
        success: true,
        data: parsedComment,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 2. Get comments for a post (with nested structure)
  async getPostComments(req, res) {
    console.log("req.query", req.query);
    console.log("req.params", req.params);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
    
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

      res.json({
        success: true,
        data: result,
        method: method,
      });
    } catch (error) {
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

  // Helper function to get replies recursively
  async getRepliesRecursively(commentId, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return [];

    const replies = await Comment.find({
      parentComment: commentId,
      del_flag: 0,
    })
      .populate("author", "username avatar")
      .sort({ createdAt: 1 }); // Replies sorted chronologically

    // Get nested replies for each reply
    const repliesWithNested = await Promise.all(
      replies.map(async (reply) => {
        const nestedReplies = await getRepliesRecursively(
          reply._id,
          maxDepth,
          currentDepth + 1
        );
        return {
          ...reply.toObject(),
          replies: nestedReplies,
        };
      })
    );

    return repliesWithNested;
  }

  // 3. Vote on a comment
  async voteComment(req, res) {
    try {
      const { commentId } = req.params;
      const { voteType } = req.body; // 'up', 'down', or 'remove'
      const userId = req.userInfo._id;

      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      // Remove existing votes
      comment.upvotes.pull(userId);
      comment.downvotes.pull(userId);

      // Add new vote
      if (voteType === "up") {
        comment.upvotes.push(userId);
      } else if (voteType === "down") {
        comment.downvotes.push(userId);
      }

      await comment.save();

      res.json({
        score: comment.score,
        userVote: voteType === "remove" ? null : voteType,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 4. Delete a comment (soft delete)
  async deleteComment(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      // Check if user owns the comment or is admin
      if (comment.author.toString() !== userId && !req.user.isAdmin) {
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
    this._router.post(`${this._rootPath}/createComment`, this.createComment);
    this._router.delete(`${this._rootPath}/deleteComment`, this.deleteComment);
  };
}

module.exports = CommentController;