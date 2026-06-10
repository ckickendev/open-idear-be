const express = require("express");
const { Controller } = require("../core");
const supportTicketService = require("../services/supportTicket.services");
const { AuthMiddleware, AdminMiddleware, OptionalAuthMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class SupportTicketController extends Controller {
    _rootPath = "/support";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    /**
     * POST /support/tickets
     * Any user (authenticated or guest) can submit a ticket
     */
    createTicket = asyncHandler(async (req, res) => {
        const { subject, category, message, priority, guestEmail } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ message: "Subject and message are required" });
        }

        const userId = req.userInfo?._id || null;

        const ticket = await supportTicketService.createTicket({
            userId,
            guestEmail,
            subject,
            category,
            message,
            priority,
        });

        res.status(201).json({
            success: true,
            message: "Yêu cầu hỗ trợ đã được gửi thành công!",
            ticket: {
                _id: ticket._id,
                subject: ticket.subject,
                status: ticket.status,
                createdAt: ticket.createdAt,
            },
        });
    });

    /**
     * GET /support/my-tickets
     * Authenticated user views their own tickets
     */
    getMyTickets = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { page = 1, limit = 10 } = req.query;
        const result = await supportTicketService.getTicketsByUser(_id, parseInt(page), parseInt(limit));
        res.json({ success: true, ...result });
    });

    /**
     * GET /support/admin/tickets
     * ADMIN ONLY — get all tickets with filtering
     */
    getAllTickets = asyncHandler(async (req, res) => {
        const { status, priority, category, page = 1, limit = 20 } = req.query;
        const result = await supportTicketService.getAllTickets({ status, priority, category, page, limit });
        res.json({ success: true, ...result });
    });

    /**
     * GET /support/admin/tickets/:id
     * ADMIN ONLY — get single ticket detail
     */
    getTicketById = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const ticket = await supportTicketService.getTicketById(id);
        res.json({ success: true, ticket });
    });

    /**
     * PATCH /support/admin/tickets/:id/status
     * ADMIN ONLY — update ticket status + admin note
     */
    updateTicketStatus = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { status, adminNote } = req.body;
        const { _id: adminId } = req.userInfo;

        if (!status) return res.status(400).json({ message: "Status is required" });

        const ticket = await supportTicketService.updateTicketStatus(id, adminId, { status, adminNote });
        res.json({ success: true, message: "Ticket updated", ticket });
    });

    /**
     * DELETE /support/admin/tickets/:id
     * ADMIN ONLY — soft delete ticket
     */
    deleteTicket = asyncHandler(async (req, res) => {
        const { id } = req.params;
        await supportTicketService.deleteTicket(id);
        res.json({ success: true, message: "Ticket deleted" });
    });

    initController = () => {
        // User routes
        this._router.post(`${this._rootPath}/tickets`, OptionalAuthMiddleware, this.createTicket);
        this._router.get(`${this._rootPath}/my-tickets`, AuthMiddleware, this.getMyTickets);

        // Admin-only routes
        this._router.get(`${this._rootPath}/admin/tickets`, AdminMiddleware, this.getAllTickets);
        this._router.get(`${this._rootPath}/admin/tickets/:id`, AdminMiddleware, this.getTicketById);
        this._router.patch(`${this._rootPath}/admin/tickets/:id/status`, AdminMiddleware, this.updateTicketStatus);
        this._router.delete(`${this._rootPath}/admin/tickets/:id`, AdminMiddleware, this.deleteTicket);
    };
}

module.exports = SupportTicketController;
