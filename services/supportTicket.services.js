const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { SupportTicket } = require("../models");
const { NotFoundException, ServerException } = require("../exceptions");

class SupportTicketService extends Service {
    /**
     * User submits a new support ticket
     */
    createTicket = async ({ userId, guestEmail, subject, category, message, priority }) => {
        try {
            const ticket = new SupportTicket({
                _id: new mongoose.Types.ObjectId(),
                user: userId || null,
                guestEmail: guestEmail || "",
                subject,
                category: category || "other",
                message,
                priority: priority || "normal",
                status: "pending",
            });
            await ticket.save();
            return ticket;
        } catch (error) {
            console.error("Error creating support ticket:", error);
            throw new ServerException("Error creating support ticket");
        }
    };

    /**
     * Get tickets submitted by a specific user
     */
    getTicketsByUser = async (userId, page = 1, limit = 10) => {
        try {
            const tickets = await SupportTicket.find({ user: userId, del_flag: 0 })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            const total = await SupportTicket.countDocuments({ user: userId, del_flag: 0 });
            return { tickets, total };
        } catch (error) {
            throw new ServerException("Error fetching user tickets");
        }
    };

    /**
     * ADMIN: Get all tickets with filters + pagination
     */
    getAllTickets = async ({ status, priority, category, page = 1, limit = 20 }) => {
        try {
            const query = { del_flag: 0 };
            if (status && status !== "all") query.status = status;
            if (priority && priority !== "all") query.priority = priority;
            if (category && category !== "all") query.category = category;

            const tickets = await SupportTicket.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .populate("user", "name username email avatar")
                .populate("resolvedBy", "name username")
                .lean();

            const total = await SupportTicket.countDocuments(query);

            // Stats
            const stats = await SupportTicket.aggregate([
                { $match: { del_flag: 0 } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]);

            const statMap = { pending: 0, in_review: 0, resolved: 0, closed: 0 };
            stats.forEach((s) => { if (statMap[s._id] !== undefined) statMap[s._id] = s.count; });

            return { tickets, total, stats: statMap };
        } catch (error) {
            console.error("Error fetching tickets:", error);
            throw new ServerException("Error fetching support tickets");
        }
    };

    /**
     * ADMIN: Get single ticket detail
     */
    getTicketById = async (ticketId) => {
        const ticket = await SupportTicket.findById(ticketId)
            .populate("user", "name username email avatar")
            .populate("resolvedBy", "name username");
        if (!ticket) throw new NotFoundException("Ticket not found");
        return ticket;
    };

    /**
     * ADMIN: Update ticket status & add admin note
     */
    updateTicketStatus = async (ticketId, adminId, { status, adminNote }) => {
        try {
            const update = { status };
            if (adminNote !== undefined) update.adminNote = adminNote;
            if (status === "resolved" || status === "closed") {
                update.resolvedBy = adminId;
                update.resolvedAt = new Date();
            }
            const ticket = await SupportTicket.findByIdAndUpdate(ticketId, update, { new: true })
                .populate("user", "name username email");
            if (!ticket) throw new NotFoundException("Ticket not found");
            return ticket;
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            throw new ServerException("Error updating ticket");
        }
    };

    /**
     * ADMIN: Soft delete ticket
     */
    deleteTicket = async (ticketId) => {
        const ticket = await SupportTicket.findByIdAndUpdate(ticketId, { del_flag: 1 }, { new: true });
        if (!ticket) throw new NotFoundException("Ticket not found");
        return { success: true };
    };
}

module.exports = new SupportTicketService();
