const mongoose = require("mongoose");
const { Collection, CollectionItem, Post, User } = require("../models");

// =============================================================================
//  COLLECTION SERVICE (KNOWLEDGE COLLECTIONS)
//  services/collection.services.js
//
//  Design Decisions:
//  - Implements Pinterest-style technical knowledge curation.
//  - Two-tier storage: Collection (metadata, visibility) + CollectionItem (ordering, notes).
//  - Robust authorization: PUBLIC and UNLISTED collections are read-accessible; PRIVATE is owner-only.
//  - Fast multi-check API for zero-latency checklist modals.
//  - Cascading cleanup on collection deletion.
// =============================================================================

class CollectionService {
  /**
   * Helper: Slugifies a string into a URL-safe lowercase slug.
   */
  slugify(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Helper: Generates a guaranteed unique slug for a collection.
   */
  async generateUniqueSlug(title, excludeCollectionId = null) {
    let baseSlug = this.slugify(title) || "collection";
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const query = { slug };
      if (excludeCollectionId) {
        query._id = { $ne: excludeCollectionId };
      }
      const existing = await Collection.findOne(query).select("_id").lean();
      if (!existing) {
        return slug;
      }
      slug = `${baseSlug}-${counter++}`;
    }
  }

  /**
   * Helper: Resolves collection by MongoDB ObjectId or slug.
   */
  async resolveCollection(idOrSlug) {
    if (!idOrSlug) return null;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      const col = await Collection.findById(idOrSlug);
      if (col) return col;
    }
    return await Collection.findOne({ slug: String(idOrSlug).toLowerCase().trim() });
  }

  /**
   * POST /collections
   * Creates a new collection for the user.
   */
  async createCollection(userId, data = {}) {
    if (!userId) {
      throw new Error("Authentication required");
    }
    const title = (data.title || "").trim();
    if (!title) {
      throw new Error("Collection title is required");
    }

    const slug = await this.generateUniqueSlug(title);
    const visibility = ["PUBLIC", "PRIVATE", "UNLISTED"].includes(data.visibility)
      ? data.visibility
      : "PUBLIC";

    const collection = await Collection.create({
      owner: userId,
      title,
      slug,
      description: (data.description || "").trim(),
      visibility,
      coverImage: data.coverImage || null,
    });

    return collection;
  }

  /**
   * GET /collections/me
   * Returns all collections owned by the user, enriched with article counts and thumbnail previews.
   */
  async getUserCollections(userId) {
    if (!userId) return [];

    const collections = await Collection.find({ owner: userId })
      .sort({ updatedAt: -1 })
      .lean();

    const enriched = await Promise.all(
      collections.map(async (col) => {
        const articleCount = await CollectionItem.countDocuments({ collectionId: col._id });

        // Retrieve up to 3 recent article thumbnails for preview collage
        const previewItems = await CollectionItem.find({ collectionId: col._id })
          .sort({ order: 1, addedAt: -1 })
          .limit(3)
          .populate({
            path: "articleId",
            select: "image title",
            populate: { path: "image", select: "url thumbnail" },
          })
          .lean();

        const previewImages = previewItems
          .map((item) => item.articleId?.image?.url || item.articleId?.image?.thumbnail || null)
          .filter(Boolean);

        return {
          ...col,
          articleCount,
          previewImages,
        };
      })
    );

    return enriched;
  }

  /**
   * GET /collections/check-article/:articleId
   * Checks which collections contain a given article. Powers the Save modal checklist.
   */
  async checkArticleCollections(userId, articleId) {
    if (!userId || !articleId) return [];

    const collections = await Collection.find({ owner: userId })
      .sort({ updatedAt: -1 })
      .lean();

    const collectionIds = collections.map((c) => c._id);

    const savedItems = await CollectionItem.find({
      articleId,
      collectionId: { $in: collectionIds },
    })
      .select("collectionId")
      .lean();

    const savedSet = new Set(savedItems.map((i) => i.collectionId.toString()));

    return collections.map((col) => ({
      _id: col._id,
      title: col.title,
      slug: col.slug,
      visibility: col.visibility,
      coverImage: col.coverImage,
      isSaved: savedSet.has(col._id.toString()),
    }));
  }

  /**
   * POST /collections/toggle-save
   * Toggles an article's presence in a collection.
   */
  async toggleArticleSave(userId, { collectionId, articleId, save, note }) {
    if (!userId || !collectionId || !articleId) {
      throw new Error("Missing required parameters (userId, collectionId, articleId)");
    }

    const collection = await Collection.findById(collectionId);
    if (!collection) {
      throw new Error("Collection not found");
    }

    // Authorization: owner only (or future editor)
    if (collection.owner.toString() !== userId.toString()) {
      throw new Error("Only the collection owner can modify contents");
    }

    if (save === true) {
      const existing = await CollectionItem.findOne({ collectionId, articleId });
      if (!existing) {
        const lastItem = await CollectionItem.findOne({ collectionId })
          .sort({ order: -1 })
          .select("order")
          .lean();
        const nextOrder = lastItem ? (lastItem.order || 0) + 1 : 0;

        await CollectionItem.create({
          collectionId,
          articleId,
          order: nextOrder,
          note: (note || "").trim(),
          addedAt: new Date(),
        });
      }
    } else {
      await CollectionItem.findOneAndDelete({ collectionId, articleId });
    }

    collection.updatedAt = new Date();
    await collection.save();

    return {
      success: true,
      collectionId,
      articleId,
      isSaved: Boolean(save),
    };
  }

  /**
   * GET /collections/:idOrSlug
   * Returns collection details, owner profile, and populated items with permission checks.
   */
  async getCollectionByIdOrSlug(idOrSlug, requestingUserId = null) {
    const collection = await this.resolveCollection(idOrSlug);
    if (!collection) {
      throw new Error("Collection not found");
    }

    const isOwner =
      requestingUserId && collection.owner.toString() === requestingUserId.toString();

    // Access control: PRIVATE collections can only be viewed by owner
    if (collection.visibility === "PRIVATE" && !isOwner) {
      throw new Error("This collection is private");
    }

    // Populate owner
    const owner = await User.findById(collection.owner)
      .select("name username avatar avatarUrl bio")
      .lean();

    // Fetch ordered items
    const rawItems = await CollectionItem.find({ collectionId: collection._id })
      .sort({ order: 1, addedAt: 1 })
      .populate({
        path: "articleId",
        select: "title slug description image author category text content aiContext createdAt updatedAt",
        populate: [
          { path: "image", select: "url thumbnail alt" },
          { path: "category", select: "name slug" },
          { path: "author", select: "name username avatar avatarUrl" },
        ],
      })
      .lean();

    const items = rawItems
      .filter((item) => item.articleId && item.articleId.title)
      .map((item) => ({
        id: item._id,
        order: item.order,
        note: item.note,
        addedAt: item.addedAt,
        article: item.articleId,
      }));

    return {
      collection: {
        _id: collection._id,
        title: collection.title,
        slug: collection.slug,
        description: collection.description,
        visibility: collection.visibility,
        coverImage: collection.coverImage,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        followersCount: collection.followers ? collection.followers.length : 0,
      },
      owner,
      items,
      isOwner: Boolean(isOwner),
    };
  }

  /**
   * PUT /collections/:id
   * Updates collection metadata (title, description, visibility, coverImage). Owner only.
   */
  async updateCollection(userId, collectionId, updateData = {}) {
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      throw new Error("Collection not found");
    }
    if (collection.owner.toString() !== userId.toString()) {
      throw new Error("Only the collection owner can update this collection");
    }

    if (updateData.title && updateData.title.trim() !== collection.title) {
      collection.title = updateData.title.trim();
      collection.slug = await this.generateUniqueSlug(collection.title, collection._id);
    }
    if (typeof updateData.description === "string") {
      collection.description = updateData.description.trim();
    }
    if (["PUBLIC", "PRIVATE", "UNLISTED"].includes(updateData.visibility)) {
      collection.visibility = updateData.visibility;
    }
    if (updateData.coverImage !== undefined) {
      collection.coverImage = updateData.coverImage;
    }

    await collection.save();
    return collection;
  }

  /**
   * DELETE /collections/:id
   * Deletes collection and all its associated items. Owner only.
   */
  async deleteCollection(userId, collectionId) {
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      throw new Error("Collection not found");
    }
    if (collection.owner.toString() !== userId.toString()) {
      throw new Error("Only the collection owner can delete this collection");
    }

    // Cascade delete items
    await CollectionItem.deleteMany({ collectionId: collection._id });
    await Collection.findByIdAndDelete(collection._id);

    return { success: true, message: "Collection deleted successfully" };
  }

  /**
   * POST /collections/:id/items
   * Adds an article to the collection with an optional note.
   */
  async addArticle(userId, collectionId, { articleId, note }) {
    return await this.toggleArticleSave(userId, {
      collectionId,
      articleId,
      save: true,
      note,
    });
  }

  /**
   * DELETE /collections/:id/items/:articleId
   * Removes an article from the collection.
   */
  async removeArticle(userId, collectionId, articleId) {
    return await this.toggleArticleSave(userId, {
      collectionId,
      articleId,
      save: false,
    });
  }

  /**
   * PUT /collections/:id/reorder
   * Reorders articles in a collection.
   * itemOrders: Array of { articleId, order } OR Array of articleIds in desired order
   */
  async reorderArticles(userId, collectionId, itemOrders) {
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      throw new Error("Collection not found");
    }
    if (collection.owner.toString() !== userId.toString()) {
      throw new Error("Only the collection owner can reorder items");
    }

    if (!Array.isArray(itemOrders)) {
      throw new Error("itemOrders must be an array");
    }

    const updates = itemOrders.map((item, index) => {
      if (typeof item === "string" || mongoose.Types.ObjectId.isValid(item)) {
        return CollectionItem.updateOne(
          { collectionId: collection._id, articleId: item },
          { order: index }
        );
      }
      return CollectionItem.updateOne(
        { collectionId: collection._id, articleId: item.articleId },
        { order: item.order ?? index }
      );
    });

    await Promise.all(updates);
    collection.updatedAt = new Date();
    await collection.save();

    return { success: true, message: "Items reordered successfully" };
  }
}

const collectionService = new CollectionService();

module.exports = {
  CollectionService,
  collectionService,
};
