const assert = require("assert");
const mongoose = require("mongoose");
const postService = require("../services/post.services");
const { Post, Like, Comment, PostTranslation, ArticleVersion, CollectionItem } = require("../models");

console.log("==================================================================");
console.log("  OPENIDEAR — POST MANAGEMENT: DELETE POST FOREVER UNIT TESTS");
console.log("==================================================================");

async function runDeletePostForeverTests() {
  const authorId = new mongoose.Types.ObjectId();
  const postId = new mongoose.Types.ObjectId();

  const mockPost = {
    _id: postId,
    title: "Understanding High-Concurrency Databases",
    author: authorId,
    del_flag: 1, // Already in trash
  };

  const origPostFindById = Post.findById;
  const origPostFindByIdAndDelete = Post.findByIdAndDelete;
  const origLikeDeleteMany = Like.deleteMany;
  const origCommentDeleteMany = Comment.deleteMany;
  const origPostTranslationDeleteMany = PostTranslation.deleteMany;
  const origArticleVersionDeleteMany = ArticleVersion.deleteMany;
  const origCollectionItemDeleteMany = CollectionItem.deleteMany;

  let postDeleted = false;
  let likesDeleted = false;
  let commentsDeleted = false;
  let translationsDeleted = false;
  let versionsDeleted = false;
  let collectionItemsDeleted = false;

  Post.findById = async (id) => {
    if (id.toString() === postId.toString()) return mockPost;
    return null;
  };

  Post.findByIdAndDelete = async (id) => {
    if (id.toString() === postId.toString()) {
      postDeleted = true;
      return mockPost;
    }
    return null;
  };

  Like.deleteMany = async (filter) => {
    if (filter.post.toString() === postId.toString()) {
      likesDeleted = true;
      return { deletedCount: 5 };
    }
    return { deletedCount: 0 };
  };

  Comment.deleteMany = async (filter) => {
    if (filter.post.toString() === postId.toString()) {
      commentsDeleted = true;
      return { deletedCount: 3 };
    }
    return { deletedCount: 0 };
  };

  PostTranslation.deleteMany = async (filter) => {
    if (filter.postId.toString() === postId.toString()) {
      translationsDeleted = true;
      return { deletedCount: 2 };
    }
    return { deletedCount: 0 };
  };

  ArticleVersion.deleteMany = async (filter) => {
    if (filter.articleId.toString() === postId.toString()) {
      versionsDeleted = true;
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  };

  CollectionItem.deleteMany = async (filter) => {
    if (filter.itemId.toString() === postId.toString()) {
      collectionItemsDeleted = true;
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  };

  try {
    // ── Test 1: Successful Permanent Deletion and Cascade Cleanup ──────────
    const result = await postService.deletePostForever(postId.toString());

    assert.strictEqual(result.success, true, "Result must indicate success");
    assert.strictEqual(postDeleted, true, "Post must be deleted from Post collection");
    assert.strictEqual(likesDeleted, true, "Associated likes must be deleted");
    assert.strictEqual(commentsDeleted, true, "Associated comments must be deleted");
    assert.strictEqual(translationsDeleted, true, "Associated translations must be deleted");
    assert.strictEqual(versionsDeleted, true, "Associated article versions must be deleted");
    assert.strictEqual(collectionItemsDeleted, true, "Associated collection items must be deleted");
    console.log("✓ Test 1: deletePostForever successfully permanently deletes post and cascades cleanup");

    // ── Test 2: Reject Non-Existent Post ──────────────────────────────────
    let notFoundError = null;
    try {
      await postService.deletePostForever(new mongoose.Types.ObjectId().toString());
    } catch (err) {
      notFoundError = err;
    }

    assert(notFoundError, "Deleting non-existent post must throw");
    console.log("✓ Test 2: deletePostForever correctly throws NotFoundException for invalid ID");

    console.log("------------------------------------------------------------------");
    console.log("  Delete Post Forever Unit Tests: 2 passed, 0 failed.");
    console.log("==================================================================");
  } finally {
    Post.findById = origPostFindById;
    Post.findByIdAndDelete = origPostFindByIdAndDelete;
    Like.deleteMany = origLikeDeleteMany;
    Comment.deleteMany = origCommentDeleteMany;
    PostTranslation.deleteMany = origPostTranslationDeleteMany;
    ArticleVersion.deleteMany = origArticleVersionDeleteMany;
    CollectionItem.deleteMany = origCollectionItemDeleteMany;
  }
}

runDeletePostForeverTests().catch((err) => {
  console.error("DeletePostForever Test Failure:", err);
  process.exit(1);
});
