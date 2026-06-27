const express = require("express");
const { Controller } = require("../core");
const mediaAssetService = require("../services/mediaAsset.services");
const mediaFolderService = require("../services/mediaFolder.services");
const asyncHandler = require("../utils/asyncHandler");
const multer = require("multer");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const {
  mediaUploadLimiter,
  mediaSearchLimiter,
} = require("../middlewares/mediaRateLimit.middleware");

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for images
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`), false);
    }
  },
});

class MediaAssetController extends Controller {
  _rootPath = "/media/v2";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ASSET ROUTES
  // ═══════════════════════════════════════════════════════════════════

  // POST /media/v2/check-duplicate
  checkDuplicate = asyncHandler(async (req, res) => {
    const { fileHash } = req.body;
    if (!fileHash) {
      return res.status(400).json({ error: "fileHash is required" });
    }

    const result = await mediaAssetService.checkDuplicate(
      req.userInfo._id,
      fileHash
    );
    res.json({ status: "success", data: result });
  });

  // POST /media/v2/upload
  uploadImage = asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const result = await mediaAssetService.uploadImage(
      req.userInfo._id,
      req.file,
      {
        folderId: req.body.folderId || null,
        description: req.body.description || "",
        altText: req.body.altText || "",
      }
    );

    res.json({ status: "success", data: result });
  });

  // GET /media/v2
  browse = asyncHandler(async (req, res) => {
    const { page, limit, sort, folder, type, isFavorite, tag } = req.query;

    const result = await mediaAssetService.getMediaByUser(req.userInfo._id, {
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 30, 100),
      sort: sort || "-createdAt",
      folder: folder || undefined,
      type: type || undefined,
      isFavorite: isFavorite === "true" ? true : undefined,
      tag: tag || undefined,
    });

    res.json({ status: "success", data: result });
  });

  // GET /media/v2/search
  search = asyncHandler(async (req, res) => {
    const { q, page, limit } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: "Search query (q) is required" });
    }

    const result = await mediaAssetService.searchMedia(req.userInfo._id, q, {
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 30, 100),
    });

    res.json({ status: "success", data: result });
  });

  // GET /media/v2/:id
  getById = asyncHandler(async (req, res) => {
    const media = await mediaAssetService.getMediaById(
      req.userInfo._id,
      req.params.id
    );
    res.json({ status: "success", data: media });
  });

  // PATCH /media/v2/:id/metadata
  updateMetadata = asyncHandler(async (req, res) => {
    const media = await mediaAssetService.updateMetadata(
      req.userInfo._id,
      req.params.id,
      req.body
    );
    res.json({ status: "success", data: media });
  });

  // POST /media/v2/:id/ai-metadata
  saveAIMetadata = asyncHandler(async (req, res) => {
    const media = await mediaAssetService.saveAIMetadata(
      req.userInfo._id,
      req.params.id,
      req.body
    );
    res.json({ status: "success", data: media });
  });

  // ─── Usage Tracking ───────────────────────────────────────────────

  // GET /media/v2/:id/usage
  getUsage = asyncHandler(async (req, res) => {
    const usage = await mediaAssetService.getUsage(
      req.params.id,
      req.userInfo._id
    );
    res.json({ status: "success", data: usage });
  });

  // POST /media/v2/:id/usage
  addUsage = asyncHandler(async (req, res) => {
    const { entityType, entityId, field } = req.body;
    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ error: "entityType and entityId are required" });
    }

    await mediaAssetService.addUsage(
      req.params.id,
      entityType,
      entityId,
      field || "content"
    );
    res.json({ status: "success" });
  });

  // DELETE /media/v2/:id/usage
  removeUsage = asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.body;
    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ error: "entityType and entityId are required" });
    }

    await mediaAssetService.removeUsage(req.params.id, entityType, entityId);
    res.json({ status: "success" });
  });

  // ─── Replace & Delete ─────────────────────────────────────────────

  // POST /media/v2/:id/replace
  replaceAsset = asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const result = await mediaAssetService.replaceAsset(
      req.userInfo._id,
      req.params.id,
      req.file
    );
    res.json({ status: "success", data: result });
  });

  // DELETE /media/v2/:id
  deleteMedia = asyncHandler(async (req, res) => {
    await mediaAssetService.softDelete(req.userInfo._id, req.params.id);
    res.json({ status: "success" });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  // POST /media/v2/bulk/move
  bulkMove = asyncHandler(async (req, res) => {
    const { mediaIds, folderId } = req.body;
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: "mediaIds array is required" });
    }

    const count = await mediaAssetService.bulkMove(
      req.userInfo._id,
      mediaIds,
      folderId || null
    );
    res.json({ status: "success", data: { modified: count } });
  });

  // POST /media/v2/bulk/tag
  bulkTag = asyncHandler(async (req, res) => {
    const { mediaIds, tags, operation = "add" } = req.body;
    if (!Array.isArray(mediaIds) || !Array.isArray(tags)) {
      return res
        .status(400)
        .json({ error: "mediaIds and tags arrays are required" });
    }

    const count = await mediaAssetService.bulkTag(
      req.userInfo._id,
      mediaIds,
      tags,
      operation
    );
    res.json({ status: "success", data: { modified: count } });
  });

  // POST /media/v2/bulk/favorite
  bulkFavorite = asyncHandler(async (req, res) => {
    const { mediaIds, isFavorite } = req.body;
    if (!Array.isArray(mediaIds)) {
      return res.status(400).json({ error: "mediaIds array is required" });
    }

    const count = await mediaAssetService.bulkFavorite(
      req.userInfo._id,
      mediaIds,
      !!isFavorite
    );
    res.json({ status: "success", data: { modified: count } });
  });

  // POST /media/v2/bulk/delete
  bulkDelete = asyncHandler(async (req, res) => {
    const { mediaIds } = req.body;
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: "mediaIds array is required" });
    }

    const count = await mediaAssetService.bulkDelete(
      req.userInfo._id,
      mediaIds
    );
    res.json({ status: "success", data: { deleted: count } });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  FOLDER ROUTES
  // ═══════════════════════════════════════════════════════════════════

  // GET /media/v2/folders
  getFolders = asyncHandler(async (req, res) => {
    const { tree } = req.query;

    const data =
      tree === "true"
        ? await mediaFolderService.getFolderTree(req.userInfo._id)
        : await mediaFolderService.getFolders(req.userInfo._id);

    res.json({ status: "success", data });
  });

  // POST /media/v2/folders
  createFolder = asyncHandler(async (req, res) => {
    const folder = await mediaFolderService.createFolder(
      req.userInfo._id,
      req.body
    );
    res.json({ status: "success", data: folder });
  });

  // PATCH /media/v2/folders/:id
  updateFolder = asyncHandler(async (req, res) => {
    const folder = await mediaFolderService.updateFolder(
      req.userInfo._id,
      req.params.id,
      req.body
    );
    res.json({ status: "success", data: folder });
  });

  // DELETE /media/v2/folders/:id
  deleteFolder = asyncHandler(async (req, res) => {
    await mediaFolderService.deleteFolder(req.userInfo._id, req.params.id);
    res.json({ status: "success" });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  ROUTE REGISTRATION
  // ═══════════════════════════════════════════════════════════════════

  initController = () => {
    const r = this._rootPath;

    // ── Assets ────────────────────────────────────────────────────
    this._router.get(
      r,
      AuthMiddleware,
      this.browse
    );
    this._router.get(
      `${r}/search`,
      AuthMiddleware,
      mediaSearchLimiter,
      this.search
    );
    this._router.post(
      `${r}/check-duplicate`,
      AuthMiddleware,
      this.checkDuplicate
    );
    this._router.post(
      `${r}/upload`,
      AuthMiddleware,
      mediaUploadLimiter,
      upload.single("image"),
      this.uploadImage
    );
    this._router.get(
      `${r}/:id`,
      AuthMiddleware,
      this.getById
    );
    this._router.patch(
      `${r}/:id/metadata`,
      AuthMiddleware,
      this.updateMetadata
    );
    this._router.post(
      `${r}/:id/ai-metadata`,
      AuthMiddleware,
      this.saveAIMetadata
    );

    // ── Usage ─────────────────────────────────────────────────────
    this._router.get(
      `${r}/:id/usage`,
      AuthMiddleware,
      this.getUsage
    );
    this._router.post(
      `${r}/:id/usage`,
      AuthMiddleware,
      this.addUsage
    );
    this._router.delete(
      `${r}/:id/usage`,
      AuthMiddleware,
      this.removeUsage
    );

    // ── Replace & Delete ──────────────────────────────────────────
    this._router.post(
      `${r}/:id/replace`,
      AuthMiddleware,
      mediaUploadLimiter,
      upload.single("image"),
      this.replaceAsset
    );
    this._router.delete(
      `${r}/:id`,
      AuthMiddleware,
      this.deleteMedia
    );

    // ── Bulk Operations ───────────────────────────────────────────
    this._router.post(`${r}/bulk/move`, AuthMiddleware, this.bulkMove);
    this._router.post(`${r}/bulk/tag`, AuthMiddleware, this.bulkTag);
    this._router.post(`${r}/bulk/favorite`, AuthMiddleware, this.bulkFavorite);
    this._router.post(`${r}/bulk/delete`, AuthMiddleware, this.bulkDelete);

    // ── Folders ───────────────────────────────────────────────────
    this._router.get(`${r}/folders`, AuthMiddleware, this.getFolders);
    this._router.post(`${r}/folders`, AuthMiddleware, this.createFolder);
    this._router.patch(`${r}/folders/:id`, AuthMiddleware, this.updateFolder);
    this._router.delete(`${r}/folders/:id`, AuthMiddleware, this.deleteFolder);
  };
}

module.exports = MediaAssetController;
