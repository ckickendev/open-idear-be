const { Service } = require("../core");
const { MediaFolder, MediaAsset } = require("../models");
const mongoose = require("mongoose");
const slugify = require("slugify");

class MediaFolderService extends Service {
  /**
   * Get all folders for a user as a flat list.
   * The client builds the tree structure from parent references.
   */
  async getFolders(userId) {
    const folders = await MediaFolder.find({
      user: userId,
      del_flag: 0,
    })
      .sort({ name: 1 })
      .lean();

    return folders;
  }

  /**
   * Get folders as a nested tree structure.
   */
  async getFolderTree(userId) {
    const folders = await this.getFolders(userId);
    return this._buildTree(folders);
  }

  _buildTree(folders, parentId = null) {
    return folders
      .filter((f) => {
        const fp = f.parent ? f.parent.toString() : null;
        return fp === (parentId ? parentId.toString() : null);
      })
      .map((f) => ({
        ...f,
        children: this._buildTree(folders, f._id),
      }));
  }

  /**
   * Create a new folder.
   */
  async createFolder(userId, data) {
    const { name, parent = null, color = "#6366f1" } = data;

    if (!name || !name.trim()) {
      throw new Error("Folder name is required");
    }

    // Enforce max nesting depth of 3
    if (parent) {
      const depth = await this._getFolderDepth(parent);
      if (depth >= 2) {
        throw new Error("Maximum folder nesting depth (3 levels) reached");
      }
    }

    const slug = slugify(name, { lower: true, strict: true });

    const folder = new MediaFolder({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      name: name.trim(),
      slug,
      parent: parent || null,
      color,
    });

    try {
      await folder.save();
    } catch (err) {
      if (err.code === 11000) {
        throw new Error(
          "A folder with this name already exists in this location"
        );
      }
      throw err;
    }

    return folder;
  }

  /**
   * Get folder nesting depth (0 = root, 1 = child, 2 = grandchild).
   */
  async _getFolderDepth(folderId) {
    let depth = 0;
    let current = await MediaFolder.findById(folderId).select("parent");

    while (current && current.parent) {
      depth++;
      if (depth >= 3) break; // Safety limit
      current = await MediaFolder.findById(current.parent).select("parent");
    }

    return depth;
  }

  /**
   * Update folder name or color.
   */
  async updateFolder(userId, folderId, updates) {
    const allowed = ["name", "color"];
    const sanitized = {};

    for (const key of allowed) {
      if (updates[key] !== undefined) sanitized[key] = updates[key];
    }

    if (sanitized.name) {
      sanitized.slug = slugify(sanitized.name, { lower: true, strict: true });
    }

    const folder = await MediaFolder.findOneAndUpdate(
      { _id: folderId, user: userId, del_flag: 0 },
      { $set: sanitized },
      { new: true }
    );

    if (!folder) throw new Error("Folder not found or access denied");
    return folder;
  }

  /**
   * Delete a folder. Assets in the folder are moved to root (not deleted).
   */
  async deleteFolder(userId, folderId) {
    const folder = await MediaFolder.findOne({
      _id: folderId,
      user: userId,
      del_flag: 0,
    });

    if (!folder) throw new Error("Folder not found");

    // Move all assets in this folder to root
    await MediaAsset.updateMany(
      { folder: folderId, user: userId, del_flag: 0 },
      { $set: { folder: null } }
    );

    // Move child folders to parent
    await MediaFolder.updateMany(
      { parent: folderId, user: userId, del_flag: 0 },
      { $set: { parent: folder.parent || null } }
    );

    // Soft-delete the folder
    folder.del_flag = 1;
    await folder.save();

    return folder;
  }
}

module.exports = new MediaFolderService();
