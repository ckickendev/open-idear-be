const express = require("express");
const { Controller } = require("../core");
const contributionService = require("../services/contribution.services");
const { AuthMiddleware, AdminMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class ContributionController extends Controller {
    _rootPath = "/contributions";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    /**
     * POST /contributions
     * Authenticated user submits a contribution
     */
    createContribution = asyncHandler(async (req, res) => {
        const { type, title, message } = req.body;

        if (!title || !message) {
            return res.status(400).json({ message: "Title and message are required" });
        }

        const userId = req.userInfo._id;

        const contribution = await contributionService.createContribution({
            userId,
            type,
            title,
            message,
        });

        res.status(201).json({
            success: true,
            message: "Đóng góp ý kiến của bạn đã được gửi thành công!",
            contribution: {
                _id: contribution._id,
                title: contribution.title,
                status: contribution.status,
                createdAt: contribution.createdAt,
            },
        });
    });

    /**
     * GET /contributions/my
     * Authenticated user views their own contributions
     */
    getMyContributions = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { page = 1, limit = 10 } = req.query;
        const result = await contributionService.getContributionsByUser(_id, parseInt(page), parseInt(limit));
        res.json({ success: true, ...result });
    });

    /**
     * GET /contributions/admin
     * ADMIN ONLY — get all contributions with filtering
     */
    getAllContributions = asyncHandler(async (req, res) => {
        const { status, type, page = 1, limit = 20 } = req.query;
        const result = await contributionService.getAllContributions({ status, type, page, limit });
        res.json({ success: true, ...result });
    });

    /**
     * GET /contributions/admin/:id
     * ADMIN ONLY — get single contribution detail
     */
    getContributionById = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const contribution = await contributionService.getContributionById(id);
        res.json({ success: true, contribution });
    });

    /**
     * PATCH /contributions/admin/:id/status
     * ADMIN ONLY — update contribution status + admin note
     */
    updateContributionStatus = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { status, adminNote } = req.body;
        const { _id: adminId } = req.userInfo;

        if (!status) return res.status(400).json({ message: "Status is required" });

        const contribution = await contributionService.updateContributionStatus(id, adminId, { status, adminNote });
        res.json({ success: true, message: "Contribution updated", contribution });
    });

    /**
     * DELETE /contributions/admin/:id
     * ADMIN ONLY — soft delete contribution
     */
    deleteContribution = asyncHandler(async (req, res) => {
        const { id } = req.params;
        await contributionService.deleteContribution(id);
        res.json({ success: true, message: "Contribution deleted" });
    });

    initController = () => {
        // User routes
        this._router.post(`${this._rootPath}`, AuthMiddleware, this.createContribution);
        this._router.get(`${this._rootPath}/my`, AuthMiddleware, this.getMyContributions);

        // Admin-only routes
        this._router.get(`${this._rootPath}/admin`, AdminMiddleware, this.getAllContributions);
        this._router.get(`${this._rootPath}/admin/:id`, AdminMiddleware, this.getContributionById);
        this._router.patch(`${this._rootPath}/admin/:id/status`, AdminMiddleware, this.updateContributionStatus);
        this._router.delete(`${this._rootPath}/admin/:id`, AdminMiddleware, this.deleteContribution);
    };
}

module.exports = ContributionController;
