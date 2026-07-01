const express = require("express");
const multer = require("multer");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { AssetUploadWorkflow } = require("../ai");
const { AssetRepository } = require("../repositories");

// Multer memory buffer configuration for raw file upload stream parsing
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * =============================================================================
 *  ASSET CONTROLLER
 *  controllers/asset.controller.js
 *
 *  Design Decisions:
 *  - Exposes REST collection API routes for Asset resources.
 *  - Leverages AssetUploadWorkflow for multi-stage upload logic (Validate -> Upload -> Persist).
 *  - Uses AssetRepository for CRUD, search, pagination, and deletion routines.
 *  - Enforces AuthMiddleware authentication context mapping on all routes.
 * =============================================================================
 */

class AssetController extends Controller {
  _rootPath = "/assets";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * POST /assets
   * Uploads and registers a new image asset.
   */
  uploadAsset = asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Key name must be 'image'." });
    }

    const { description = "", alt = "", tags = "" } = req.body;

    // Split tag strings comma-separated into array
    const tagsArray = tags
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const workflow = new AssetUploadWorkflow();
    const asset = await workflow.execute({
      userId: req.userInfo._id,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      },
      options: {
        description,
        alt,
        tags: tagsArray,
      },
    });

    res.status(201).json({
      status: "success",
      data: asset,
    });
  });

  /**
   * GET /assets
   * Fetches paginated assets for the authenticated owner.
   * Supports text query search, sorting, and page limits.
   */
  getAssets = asyncHandler(async (req, res) => {
    const { q, page, limit, sort } = req.query;
    const userId = req.userInfo._id;

    const options = {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 30, 100),
      sort: sort || "-createdAt",
    };

    let result;
    if (q && q.trim()) {
      result = await AssetRepository.search(userId, q, options);
    } else {
      result = await AssetRepository.findByOwner(userId, options);
    }

    res.json({
      status: "success",
      data: result,
    });
  });

  /**
   * GET /assets/:id
   * Retrieves full details for a single asset.
   */
  getAssetById = asyncHandler(async (req, res) => {
    const asset = await AssetRepository.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    // Access control: check ownership context
    if (asset.ownerId.toString() !== req.userInfo._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      status: "success",
      data: asset,
    });
  });

  /**
   * DELETE /assets/:id
   * Soft deletes a target asset.
   */
  deleteAsset = asyncHandler(async (req, res) => {
    const asset = await AssetRepository.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    // Access control: check ownership context
    if (asset.ownerId.toString() !== req.userInfo._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    await AssetRepository.delete(req.params.id);

    res.json({
      status: "success",
      message: "Asset soft-deleted successfully",
    });
  });

  /**
   * Registers router endpoints
   */
  initController = () => {
    this._router.post(
      this._rootPath,
      AuthMiddleware,
      upload.single("image"),
      this.uploadAsset
    );
    this._router.get(
      this._rootPath,
      AuthMiddleware,
      this.getAssets
    );
    this._router.get(
      `${this._rootPath}/:id`,
      AuthMiddleware,
      this.getAssetById
    );
    this._router.delete(
      `${this._rootPath}/:id`,
      AuthMiddleware,
      this.deleteAsset
    );
  };
}

module.exports = AssetController;
