const { Asset } = require("../models");
const mongoose = require("mongoose");

/**
 * =============================================================================
 *  ASSET REPOSITORY
 *  repositories/asset.repository.js
 *
 *  Design Decisions:
 *  - Encapsulates database access queries for the Asset model.
 *  - Follows repository pattern isolating MongoDB details from service layers.
 *  - Pure database actions with no business logic.
 * =============================================================================
 */

class AssetRepository {
  /**
   * Create and persist a new asset document
   */
  async create(data) {
    const asset = new Asset({
      _id: new mongoose.Types.ObjectId(),
      ...data,
    });
    return await asset.save();
  }

  /**
   * Find a single asset by its ID
   */
  async findById(id, projection = {}) {
    return await Asset.findOne({ _id: id, del_flag: 0 }).select(projection);
  }

  /**
   * Find paginated assets belonging to an owner
   */
  async findByOwner(ownerId, options = {}) {
    const { page = 1, limit = 30, sort = "-createdAt", projection = {} } = options;
    const filter = { ownerId, del_flag: 0 };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Asset.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(projection)
        .lean(),
      Asset.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + items.length < total,
      },
    };
  }

  /**
   * Find recent assets for a user
   */
  async findRecent(ownerId, limit = 10, projection = {}) {
    return await Asset.find({ ownerId, del_flag: 0 })
      .sort("-createdAt")
      .limit(limit)
      .select(projection)
      .lean();
  }

  /**
   * Perform paginated full-text search queries
   */
  async search(ownerId, query, options = {}) {
    const { page = 1, limit = 30, projection = {} } = options;
    const skip = (page - 1) * limit;
    const filter = {
      ownerId,
      del_flag: 0,
      $text: { $search: query },
    };

    const [items, total] = await Promise.all([
      Asset.find(filter, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .skip(skip)
        .limit(limit)
        .select(projection)
        .lean(),
      Asset.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + items.length < total,
      },
    };
  }

  /**
   * Update an asset document updates
   */
  async update(id, updates) {
    const asset = await Asset.findOneAndUpdate(
      { _id: id, del_flag: 0 },
      { $set: updates },
      { new: true }
    );
    if (!asset) throw new Error("Asset not found");
    return asset;
  }

  /**
   * Soft delete an asset by ID
   */
  async delete(id) {
    const asset = await Asset.findOneAndUpdate(
      { _id: id, del_flag: 0 },
      { $set: { del_flag: 1 } },
      { new: true }
    );
    if (!asset) throw new Error("Asset not found");
    return asset;
  }
}

module.exports = new AssetRepository();
