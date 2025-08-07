const mongoose = require("mongoose");

const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    content: { 
      type: String, 
      required: true,
      maxlength: 2000 // Limit comment length
    },
    author: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "user", 
      required: true 
    },
    post: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "post", 
      required: true 
    },
    // For nested comments - null if it's a top-level comment
    parentComment: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "comment",
      default: null 
    },
    // Array of direct replies to this comment
    replies: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "comment" 
    }],
    // For performance - count of total replies (including nested)
    totalReplies: {
      type: Number,
      default: 0
    },
    // Voting system
    upvotes: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "user" 
    }],
    // Score for sorting (upvotes - downvotes)
    score: {
      type: Number,
      default: 0
    },
    // For soft delete
    del_flag: {
      type: Number,
      default: 0 // 0: active, 1: deleted
    },
    // For moderation
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date
    },
    // Nested level (0 for top-level, 1 for first reply, etc.)
    level: {
      type: Number,
      default: 0,
      max: 2 // Limit nesting depth
    }
  },
  {
    timestamps: true, // createdAt, updatedAt
    versionKey: false
  }
);

// Indexes for better performance
commentSchema.index({ post: 1, createdAt: -1 }); // Get comments by post
commentSchema.index({ parentComment: 1, createdAt: 1 }); // Get replies
commentSchema.index({ author: 1 }); // Get comments by user
commentSchema.index({ post: 1, level: 1, score: -1 }); // For sorting

// Pre-save middleware to update score
commentSchema.pre('save', function(next) {
  this.score = this.upvotes.length
  next();
});

module.exports = mongoose.model("comment", commentSchema);