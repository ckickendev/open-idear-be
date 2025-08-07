// Method 4: Load More Replies (for "show more replies" functionality)
async function loadMoreReplies(parentCommentId, skip = 0, limit = 5) {
  try {
    const replies = await Comment.find({
      parentComment: parentCommentId,
      del_flag: 0
    })
    .populate('author', 'username avatar')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
    
    const formattedReplies = replies.map(reply => ({
      ...reply,
      timeAgo: getTimeAgo(reply.createdAt),
      voteCount: reply.upvotes.length - reply.downvotes.length,
      level: reply.level
    }));
    
    const totalReplies = await Comment.countDocuments({
      parentComment: parentCommentId,
      del_flag: 0
    });
    
    return {
      replies: formattedReplies,
      hasMore: (skip + limit) < totalReplies,
      total: totalReplies
    };
  } catch (error) {
    throw new Error(`Error loading more replies: ${error.message}`);
  }
}

// Utility function for time formatting
function getTimeAgo(date) {
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
  if (diffInMonths < 12) return `${diffInMonths} tháng ${diffInMonths === 1 ? '' : ''}`;
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} năm trước`;
}



// Method 6: Search and Filter Comments
async function parseFilteredComments(postId, filters = {}) {
  try {
    const {
      authorId,
      minScore = null,
      maxLevel = null,
      dateFrom = null,
      dateTo = null,
      searchText = null
    } = filters;
    
    let query = { post: postId, del_flag: 0 };
    
    // Apply filters
    if (authorId) query.author = authorId;
    if (minScore !== null) query.score = { $gte: minScore };
    if (maxLevel !== null) query.level = { $lte: maxLevel };
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    if (searchText) {
      query.content = { $regex: searchText, $options: 'i' };
    }
    
    const comments = await Comment.find(query)
      .populate('author', 'username avatar')
      .sort({ score: -1, createdAt: -1 })
      .lean();
    
    return comments.map(comment => ({
      ...comment,
      timeAgo: getTimeAgo(comment.createdAt),
      voteCount: comment.upvotes.length - comment.downvotes.length,
      highlighted: searchText ? comment.content.includes(searchText) : false
    }));
  } catch (error) {
    throw new Error(`Error filtering comments: ${error.message}`);
  }
}

module.exports = {
  loadMoreReplies,
  parseFilteredComments,
  getTimeAgo
};