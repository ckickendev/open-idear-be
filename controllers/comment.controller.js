const express = require("express");
const { Controller } = require("../core");
const { commentService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class CommentController extends Controller {
    _rootPath = "/comment";
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
    
          let level = 0;
          if (parentCommentId) {
            const parentComment = await Comment.findById(parentCommentId);
            if (!parentComment) {
              return res.status(404).json({ error: "Parent comment not found" });
            }
            level = parentComment.level + 1;
    
            // Limit nesting depth
            if (level > 10) {
              return res
                .status(400)
                .json({ error: "Maximum nesting level reached" });
            }
          }
    
          const comment = new Comment({
            content,
            author: userId,
            post: postId,
            parentComment: parentCommentId,
            level,
          });
    
          await comment.save();
    
          // Update parent comment's replies array
          if (parentCommentId) {
            await Comment.findByIdAndUpdate(parentCommentId, {
              $push: { replies: comment._id },
              $inc: { totalReplies: 1 },
            });
          }
    
          // Update post's comments array
          await Post.findByIdAndUpdate(postId, {
            $push: { comments: comment._id },
          });
    
          // Populate and return the comment
          const populatedComment = await Comment.findById(comment._id)
            .populate("author", "username avatar")
            .populate("replies");
    
          res.status(201).json(populatedComment);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    
      // 2. Get comments for a post (with nested structure)
      async getPostComments(req, res) {
        try {
          const { postId } = req.params;
          const { page = 1, limit = 20, sortBy = "hot" } = req.query;
    
          let sortOptions = {};
          switch (sortBy) {
            case "hot":
              sortOptions = { score: -1, createdAt: -1 };
              break;
            case "newest":
              sortOptions = { createdAt: -1 };
              break;
            case "oldest":
              sortOptions = { createdAt: 1 };
              break;
            default:
              sortOptions = { score: -1, createdAt: -1 };
          }
    
          // Get top-level comments only
          const topLevelComments = await Comment.find({
            post: postId,
            parentComment: null,
            del_flag: 0,
          })
            .populate("author", "username avatar")
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit);
    
          // For each top-level comment, get its replies recursively
          const commentsWithReplies = await Promise.all(
            topLevelComments.map(async (comment) => {
              const replies = await getRepliesRecursively(comment._id, 3); // Limit depth
              return {
                ...comment.toObject(),
                replies,
              };
            })
          );
    
          res.json({
            comments: commentsWithReplies,
            page: parseInt(page),
            totalPages: Math.ceil(
              (await Comment.countDocuments({
                post: postId,
                parentComment: null,
                del_flag: 0,
              })) / limit
            ),
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
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