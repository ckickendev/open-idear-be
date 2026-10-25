const mongoose = require("mongoose");
const { Post, ArticleVersion, User } = require("../models");
const {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} = require("../exceptions");

// =============================================================================
//  ARTICLE VERSION SERVICE
//  services/articleVersion.services.js
//
//  Design Decisions:
//  - Implements immutable versioning for articles (posts).
//  - Every publish or rollback creates an append-only snapshot in `articleVersion`.
//  - The `post` document always points to `currentVersionId` and `latestVersion`.
//  - Automatically increments semantic version numbers (1.0 -> 1.1 -> 1.2; or 2.0 on major).
//  - Ensures rollback creates a NEW version with target version's content,
//    strictly preventing history mutation.
//  - Provides lazy initialization for existing posts that were created prior to Sprint 1.
// =============================================================================

class ArticleVersionService {
  /**
   * Calculates the next version string based on current latest version.
   * e.g. "1.0" -> "1.1", "1.9" -> "1.10", major "1.3" -> "2.0".
   *
   * @param {string} currentLatest - The current latest version string.
   * @param {boolean} isMajor - Whether to increment major version.
   * @returns {string} The next version string.
   */
  calculateNextVersion(currentLatest = "1.0", isMajor = false) {
    if (!currentLatest || typeof currentLatest !== "string") {
      return "1.0";
    }

    const parts = currentLatest.trim().split(".");
    let major = parseInt(parts[0], 10) || 1;
    let minor = parseInt(parts[1], 10) || 0;

    if (isMajor) {
      return `${major + 1}.0`;
    }

    return `${major}.${minor + 1}`;
  }

  /**
   * Finds post by slug or by ObjectId string.
   *
   * @param {string} slugOrId
   * @returns {Promise<any>}
   */
  async findPostBySlugOrId(slugOrId) {
    if (!slugOrId) return null;

    let post = null;
    if (mongoose.Types.ObjectId.isValid(slugOrId)) {
      post = await Post.findById(slugOrId).populate("author", "username email avatar avatarUrl role");
    }

    if (!post) {
      post = await Post.findOne({ slug: slugOrId.toLowerCase().trim() }).populate(
        "author",
        "username email avatar avatarUrl role"
      );
    }

    return post;
  }

  /**
   * Lazy initializes version 1.0 for a post if it doesn't have an active version.
   * Ensures seamless backward compatibility for existing posts.
   *
   * @param {any} post - The Mongoose post document.
   * @returns {Promise<any>} The initialized or existing version document.
   */
  async ensureInitialVersion(post) {
    if (!post) return null;

    // If currentVersionId exists and points to a real document, return it
    if (post.currentVersionId) {
      const existingVersion = await ArticleVersion.findById(post.currentVersionId);
      if (existingVersion) {
        return existingVersion;
      }
    }

    // Check if any version already exists for this articleId
    const firstVersion = await ArticleVersion.findOne({
      articleId: post._id,
      version: "1.0",
    });

    if (firstVersion) {
      if (!post.currentVersionId || post.currentVersionId.toString() !== firstVersion._id.toString()) {
        post.currentVersionId = firstVersion._id;
        post.latestVersion = firstVersion.version || "1.0";
        await post.save();
      }
      return firstVersion;
    }

    // Create initial 1.0 snapshot from existing post content
    const authorId = post.author?._id || post.author;
    const initialVersion = await ArticleVersion.create({
      articleId: post._id,
      version: "1.0",
      markdown: post.text || post.content || "",
      html: post.content || "",
      blocks: post.blocks || undefined,
      changelog: "Initial version",
      createdBy: authorId,
      source: "manual",
      createdAt: post.createdAt || new Date(),
    });

    post.currentVersionId = initialVersion._id;
    post.latestVersion = "1.0";
    await post.save();

    return initialVersion;
  }

  /**
   * GET /articles/:slug/history
   * Retrieves full version timeline for an article.
   *
   * @param {string} slugOrId
   * @returns {Promise<object>}
   */
  async getVersionHistory(slugOrId) {
    const post = await this.findPostBySlugOrId(slugOrId);
    if (!post) {
      throw new NotFoundException(`Article "${slugOrId}" not found`);
    }

    // Ensure post has at least version 1.0
    await this.ensureInitialVersion(post);

    const versions = await ArticleVersion.find({ articleId: post._id })
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email avatar avatarUrl role");

    const currentVersionNumber = post.latestVersion || "1.0";

    const history = versions.map((v) => ({
      id: v._id.toString(),
      version: v.version,
      changelog: v.changelog || "",
      source: v.source,
      createdAt: v.createdAt,
      author: {
        id: v.createdBy?._id?.toString() || "",
        username: v.createdBy?.username || "Anonymous",
        avatar: v.createdBy?.avatar || v.createdBy?.avatarUrl || "",
        email: v.createdBy?.email || "",
      },
      isCurrent: v.version === currentVersionNumber,
    }));

    return {
      article: {
        id: post._id.toString(),
        title: post.title,
        slug: post.slug,
        latestVersion: currentVersionNumber,
        published: post.published,
      },
      history,
    };
  }

  /**
   * GET /articles/:slug/version/:version
   * Retrieves full content of a specific historical version.
   *
   * @param {string} slugOrId
   * @param {string} versionNumber
   * @returns {Promise<object>}
   */
  async getVersionContent(slugOrId, versionNumber) {
    const post = await this.findPostBySlugOrId(slugOrId);
    if (!post) {
      throw new NotFoundException(`Article "${slugOrId}" not found`);
    }

    await this.ensureInitialVersion(post);

    const versionDoc = await ArticleVersion.findOne({
      articleId: post._id,
      version: versionNumber.trim(),
    }).populate("createdBy", "username email avatar avatarUrl role");

    if (!versionDoc) {
      throw new NotFoundException(
        `Version "${versionNumber}" not found for article "${post.title}"`
      );
    }

    return {
      article: {
        id: post._id.toString(),
        title: post.title,
        slug: post.slug,
        latestVersion: post.latestVersion || "1.0",
        authorId: post.author?._id ? post.author._id.toString() : post.author?.toString(),
      },
      version: {
        id: versionDoc._id.toString(),
        version: versionDoc.version,
        markdown: versionDoc.markdown || "",
        html: versionDoc.html || "",
        blocks: versionDoc.blocks || [],
        changelog: versionDoc.changelog || "",
        source: versionDoc.source,
        createdAt: versionDoc.createdAt,
        author: {
          id: versionDoc.createdBy?._id?.toString() || "",
          username: versionDoc.createdBy?.username || "Anonymous",
          avatar: versionDoc.createdBy?.avatar || versionDoc.createdBy?.avatarUrl || "",
          email: versionDoc.createdBy?.email || "",
        },
        isCurrent: versionDoc.version === (post.latestVersion || "1.0"),
      },
    };
  }

  /**
   * POST /articles/:id/version
   * Creates an immutable new version for an article. Owner only.
   *
   * @param {string} postId
   * @param {string} userId
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async createNewVersion(postId, userId, payload) {
    const {
      markdown,
      html,
      blocks,
      changelog = "",
      source = "manual",
      isMajor = false,
    } = payload;

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundException(`Article with ID "${postId}" not found`);
    }

    // Ownership check
    const authorId = post.author?._id ? post.author._id.toString() : post.author.toString();
    if (authorId !== userId.toString()) {
      throw new ForbiddenException("Access denied. Only the article owner can create new versions.");
    }

    // Ensure baseline version exists
    await this.ensureInitialVersion(post);

    // Compute automatic version increment
    const currentLatest = post.latestVersion || "1.0";
    const nextVersion = this.calculateNextVersion(currentLatest, isMajor);

    // Build contents with fallback to post current fields
    const finalHtml = html !== undefined ? html : (post.content || "");
    const finalMarkdown = markdown !== undefined ? markdown : (post.text || post.content || "");
    const finalBlocks = blocks !== undefined ? blocks : (post.blocks || undefined);

    const defaultChangelog =
      source === "ai"
        ? "AI generated revision"
        : `Updated to version ${nextVersion}`;

    // Create immutable version snapshot
    const newVersion = await ArticleVersion.create({
      articleId: post._id,
      version: nextVersion,
      markdown: finalMarkdown,
      html: finalHtml,
      blocks: finalBlocks,
      changelog: changelog?.trim() || defaultChangelog,
      createdBy: userId,
      source: source === "ai" ? "ai" : "manual",
      createdAt: new Date(),
    });

    // Update Post head
    post.currentVersionId = newVersion._id;
    post.latestVersion = nextVersion;
    if (html !== undefined) post.content = html;
    if (markdown !== undefined) post.text = markdown;
    if (blocks !== undefined) post.blocks = blocks;
    post.updatedAt = new Date();
    await post.save();

    return {
      version: {
        id: newVersion._id.toString(),
        version: newVersion.version,
        changelog: newVersion.changelog,
        source: newVersion.source,
        createdAt: newVersion.createdAt,
      },
      post: {
        id: post._id.toString(),
        title: post.title,
        slug: post.slug,
        latestVersion: post.latestVersion,
      },
    };
  }

  /**
   * PATCH /articles/:id/rollback/:version
   * Creates a NEW version from an old version. Never mutates history.
   *
   * @param {string} postId
   * @param {string} userId
   * @param {string} targetVersionNumber
   * @param {string} [customChangelog]
   * @returns {Promise<object>}
   */
  async rollbackVersion(postId, userId, targetVersionNumber, customChangelog) {
    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundException(`Article with ID "${postId}" not found`);
    }

    // Ownership check
    const authorId = post.author?._id ? post.author._id.toString() : post.author.toString();
    if (authorId !== userId.toString()) {
      throw new ForbiddenException("Access denied. Only the article owner can rollback versions.");
    }

    // Ensure baseline version exists
    await this.ensureInitialVersion(post);

    const targetVersion = await ArticleVersion.findOne({
      articleId: post._id,
      version: targetVersionNumber.trim(),
    });

    if (!targetVersion) {
      throw new NotFoundException(
        `Target version "${targetVersionNumber}" not found for article "${post.title}"`
      );
    }

    // Next version increment for the rollback commit
    const currentLatest = post.latestVersion || "1.0";
    const nextVersion = this.calculateNextVersion(currentLatest, false);

    const changelog =
      customChangelog?.trim() || `Rollback to version ${targetVersionNumber}`;

    // Create a NEW snapshot document copying historical content
    const rollbackVersionDoc = await ArticleVersion.create({
      articleId: post._id,
      version: nextVersion,
      markdown: targetVersion.markdown,
      html: targetVersion.html,
      blocks: targetVersion.blocks,
      changelog,
      createdBy: userId,
      source: "manual",
      createdAt: new Date(),
    });

    // Update Post head with rolled back content
    post.currentVersionId = rollbackVersionDoc._id;
    post.latestVersion = nextVersion;
    post.content = targetVersion.html;
    post.text = targetVersion.markdown || targetVersion.html;
    post.blocks = targetVersion.blocks;
    post.updatedAt = new Date();
    await post.save();

    return {
      message: `Successfully rolled back to version ${targetVersionNumber}. Created new version ${nextVersion}.`,
      version: {
        id: rollbackVersionDoc._id.toString(),
        version: rollbackVersionDoc.version,
        changelog: rollbackVersionDoc.changelog,
        source: rollbackVersionDoc.source,
        createdAt: rollbackVersionDoc.createdAt,
      },
      post: {
        id: post._id.toString(),
        title: post.title,
        slug: post.slug,
        latestVersion: post.latestVersion,
      },
    };
  }
}

const articleVersionService = new ArticleVersionService();

module.exports = {
  articleVersionService,
  ArticleVersionService,
};
