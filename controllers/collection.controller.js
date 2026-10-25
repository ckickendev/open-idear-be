const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware, OptionalAuthMiddleware } = require("../middlewares/auth.middleware");
const { collectionService } = require("../services/collection.services");

// =============================================================================
//  COLLECTION CONTROLLER (KNOWLEDGE COLLECTIONS)
//  controllers/collection.controller.js
//
//  Design Decisions:
//  - Implements RESTful Knowledge Collections endpoints.
//  - POST /collections: Create new collection (authenticated).
//  - GET /collections/me: Fetch user's collections with thumbnails & counts.
//  - GET /collections/check-article/:articleId: Check save status for article.
//  - POST /collections/toggle-save: Fast toggle save/unsave in modal.
//  - GET /collections/:idOrSlug: Public / shared collection view (optional auth).
//  - PUT /collections/:id: Update collection metadata (owner only).
//  - DELETE /collections/:id: Delete collection + cascade items (owner only).
//  - POST /collections/:id/items: Add article with note (owner only).
//  - DELETE /collections/:id/items/:articleId: Remove article (owner only).
//  - PUT /collections/:id/reorder: Batch reorder articles (owner only).
// =============================================================================

class CollectionController extends Controller {
  _rootPath = "/collections";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * POST /collections
   */
  createCollection = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { title, description, visibility, coverImage } = req.body;

    const collection = await collectionService.createCollection(userId, {
      title,
      description,
      visibility,
      coverImage,
    });

    res.status(201).json({
      success: true,
      data: collection,
    });
  });

  /**
   * GET /collections/me
   */
  getMyCollections = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const collections = await collectionService.getUserCollections(userId);

    res.status(200).json({
      success: true,
      data: collections,
    });
  });

  /**
   * GET /collections/check-article/:articleId
   */
  checkArticle = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { articleId } = req.params;

    const statusList = await collectionService.checkArticleCollections(userId, articleId);

    res.status(200).json({
      success: true,
      data: statusList,
    });
  });

  /**
   * POST /collections/toggle-save
   */
  toggleSave = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { collectionId, articleId, save, note } = req.body;

    const result = await collectionService.toggleArticleSave(userId, {
      collectionId,
      articleId,
      save,
      note,
    });

    res.status(200).json(result);
  });

  /**
   * GET /collections/:idOrSlug
   */
  getCollection = asyncHandler(async (req, res) => {
    const requestingUserId = req.userInfo?._id || null;
    const { idOrSlug } = req.params;

    const data = await collectionService.getCollectionByIdOrSlug(idOrSlug, requestingUserId);

    res.status(200).json({
      success: true,
      data,
    });
  });

  /**
   * PUT /collections/:id
   */
  updateCollection = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { id } = req.params;
    const { title, description, visibility, coverImage } = req.body;

    const updated = await collectionService.updateCollection(userId, id, {
      title,
      description,
      visibility,
      coverImage,
    });

    res.status(200).json({
      success: true,
      data: updated,
    });
  });

  /**
   * DELETE /collections/:id
   */
  deleteCollection = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { id } = req.params;

    const result = await collectionService.deleteCollection(userId, id);

    res.status(200).json(result);
  });

  /**
   * POST /collections/:id/items
   */
  addItem = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { id } = req.params;
    const { articleId, note } = req.body;

    const result = await collectionService.addArticle(userId, id, {
      articleId,
      note,
    });

    res.status(200).json(result);
  });

  /**
   * DELETE /collections/:id/items/:articleId
   */
  removeItem = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { id, articleId } = req.params;

    const result = await collectionService.removeArticle(userId, id, articleId);

    res.status(200).json(result);
  });

  /**
   * PUT /collections/:id/reorder
   */
  reorderItems = asyncHandler(async (req, res) => {
    const userId = req.userInfo?._id;
    const { id } = req.params;
    const { itemOrders } = req.body;

    const result = await collectionService.reorderArticles(userId, id, itemOrders);

    res.status(200).json(result);
  });

  initController = () => {
    this._router.post(`${this._rootPath}`, AuthMiddleware, this.createCollection);
    this._router.get(`${this._rootPath}/me`, AuthMiddleware, this.getMyCollections);
    this._router.get(`${this._rootPath}/check-article/:articleId`, AuthMiddleware, this.checkArticle);
    this._router.post(`${this._rootPath}/toggle-save`, AuthMiddleware, this.toggleSave);
    this._router.get(`${this._rootPath}/:idOrSlug`, OptionalAuthMiddleware, this.getCollection);
    this._router.put(`${this._rootPath}/:id`, AuthMiddleware, this.updateCollection);
    this._router.delete(`${this._rootPath}/:id`, AuthMiddleware, this.deleteCollection);
    this._router.post(`${this._rootPath}/:id/items`, AuthMiddleware, this.addItem);
    this._router.delete(`${this._rootPath}/:id/items/:articleId`, AuthMiddleware, this.removeItem);
    this._router.put(`${this._rootPath}/:id/reorder`, AuthMiddleware, this.reorderItems);
  };
}

module.exports = CollectionController;
