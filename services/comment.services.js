const { Service } = require("../core");
const { ServerException } = require("../exceptions");
const { Comment, Post } = require("../models");
const mongoose = require("mongoose");

class CommentService extends Service {
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
  async createComment({ content, userId, postId, parentCommentId, level }) {
    // Create comment
    const comment = new Comment({
      _id: new mongoose.Types.ObjectId(),
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
    const populatedComment = await this.findCommentById(comment._id);

    // Parse for client consumption
    const parsedComment = this.parseNewComment(populatedComment);

    return parsedComment;
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
      const userId = req.user.id;

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

  async findCommentById(commentId) {
    const comment = Comment.findById(commentId)
      .populate("author", "username avatar")
      .lean();
    return comment;
  }

  async parseCommentsRecursive(postId, maxDepth = 5) {
    try {
      // Get all comments for the post
      const allComments = await Comment.find({
        post: postId,
        del_flag: 0,
      })
        .populate("author", "username avatar")
        .sort({ createdAt: 1 })
        .lean(); // Use lean() for better performance

      // Create a map for quick lookup
      const commentMap = {};
      allComments.forEach((comment) => {
        commentMap[comment._id] = {
          ...comment,
          replies: [],
          timeAgo: getTimeAgo(comment.createdAt),
          voteCount: comment.upvotes.length,
        };
      });

      // Build the tree structure
      const rootComments = [];

      allComments.forEach((comment) => {
        if (comment.parentComment) {
          // This is a reply
          if (commentMap[comment.parentComment]) {
            commentMap[comment.parentComment].replies.push(
              commentMap[comment._id]
            );
          }
        } else {
          // This is a top-level comment
          rootComments.push(commentMap[comment._id]);
        }
      });

      return rootComments;
    } catch (error) {
      throw new Error(`Error parsing comments: ${error.message}`);
    }
  }

  async parseCommentsFlat(postId, page = 1, limit = 20) {
    try {
      const comments = await Comment.aggregate([
        // Match comments for the post
        { $match: { post: mongoose.Types.ObjectId(postId), del_flag: 0 } },

        // Lookup author details
        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
            pipeline: [{ $project: { username: 1, avatar: 1 } }],
          },
        },
        { $unwind: "$author" },

        // Add computed fields
        {
          $addFields: {
            voteCount: {
              $subtract: [{ $size: "$upvotes" }, { $size: "$downvotes" }],
            },
            replyCount: { $size: "$replies" },
            isTopLevel: { $eq: ["$parentComment", null] },
          },
        },

        // Sort: top-level first, then by creation time
        {
          $sort: {
            isTopLevel: -1,
            level: 1,
            createdAt: 1,
          },
        },

        // Pagination
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      // Add time ago and format
      const formattedComments = comments.map((comment) => ({
        ...comment,
        timeAgo: getTimeAgo(comment.createdAt),
        canReply: comment.level < 10, // Max nesting depth
        indentLevel: Math.min(comment.level, 5), // Max visual indent
      }));

      return {
        comments: formattedComments,
        page,
        hasMore: formattedComments.length === limit,
      };
    } catch (error) {
      throw new Error(`Error parsing flat comments: ${error.message}`);
    }
  }

  async parseCommentsPaginated(postId, page = 1, limit = 10) {
    try {
      // Get top-level comments with pagination
      const topLevelComments = await Comment.find({
        post: postId,
        parentComment: null,
        del_flag: 0,
      })
        .populate("author", "username avatar")
        .sort({ score: -1, createdAt: -1 }) // Hot sorting
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      // For each top-level comment, get first few replies
      const commentsWithReplies = await Promise.all(
        topLevelComments.map(async (comment) => {
          // Get direct replies (limit to 3 initially)
          const directReplies = await Comment.find({
            parentComment: comment._id,
            del_flag: 0,
          })
            .populate("author", "username avatar")
            .sort({ createdAt: 1 })
            .limit(3)
            .lean();

          // Count total replies for "show more" functionality
          const totalReplies = await Comment.countDocuments({
            parentComment: comment._id,
            del_flag: 0,
          });

          // Format replies
          const formattedReplies = directReplies.map((reply) => ({
            ...reply,
            timeAgo: this.getTimeAgo(reply.createdAt),
            voteCount: reply.upvotes.length - reply.downvotes.length,
            level: 1,
          }));

          return {
            ...comment,
            timeAgo: this.getTimeAgo(comment.createdAt),
            voteCount: comment.upvotes.length - comment.downvotes.length,
            replies: formattedReplies,
            totalReplies,
            hasMoreReplies: totalReplies > 3,
            level: 0,
          };
        })
      );

      return {
        comments: commentsWithReplies,
        page,
        hasMore: topLevelComments.length === limit,
      };
    } catch (error) {
      throw new Error(`Error parsing paginated comments: ${error.message}`);
    }
  }

  // Method 5: Real-time Comment Parsing (for WebSocket updates)
  async parseNewComment(commentData) {
    return {
      ...commentData,
      timeAgo: "vừa xong",
      voteCount: 0,
      replies: [],
      canReply: commentData.level < 10,
      isNew: true, // Flag for highlighting new comments
    };
  }

  async voteLike(postId, userId) {
    const post = await Post.findById(postId);
    if(!post) {
      throw new ServerException("Not found post");
    }

    let isLike;

    console.log("post.likes", post.likes);

    if (post.likes.includes(userId)) {
      console.log("post.likes 1");
      post.likes.pull(userId);
      isLike = false;
    } else {
      console.log("post.likes 2");
      post.likes.push(userId);
      isLike = true;
    }

    await post.save();

    return isLike;
  }

  getTimeAgo(date) {
    
    const now = new Date();
    const commentDate = new Date(date);
    const diffInSeconds = Math.floor((now - commentDate) / 1000);

    if (diffInSeconds < 60) return "vừa xong";

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} phút trước`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} giờ trước`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} ngày trước`;

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12)
      return `${diffInMonths} tháng ${diffInMonths === 1 ? "" : ""}`;

    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears} năm trước`;
  }
}

module.exports = new CommentService();
