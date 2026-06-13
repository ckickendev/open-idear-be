const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Contribution } = require("../models");
const { NotFoundException, ServerException } = require("../exceptions");

class ContributionService extends Service {
    /**
     * User submits a new contribution
     */
    createContribution = async ({ userId, type, title, message }) => {
        try {
            const contribution = new Contribution({
                _id: new mongoose.Types.ObjectId(),
                user: userId || null,
                type: type || "other",
                title,
                message,
                status: "new",
            });
            await contribution.save();
            return contribution;
        } catch (error) {
            console.error("Error creating contribution:", error);
            throw new ServerException("Error creating contribution");
        }
    };

    /**
     * Get contributions submitted by a specific user
     */
    getContributionsByUser = async (userId, page = 1, limit = 10) => {
        try {
            const contributions = await Contribution.find({ user: userId, del_flag: 0 })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            const total = await Contribution.countDocuments({ user: userId, del_flag: 0 });
            return { contributions, total };
        } catch (error) {
            throw new ServerException("Error fetching user contributions");
        }
    };

    /**
     * ADMIN: Get all contributions with filters + pagination
     */
    getAllContributions = async ({ status, type, page = 1, limit = 20 }) => {
        try {
            const query = { del_flag: 0 };
            if (status && status !== "all") query.status = status;
            if (type && type !== "all") query.type = type;

            const contributions = await Contribution.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .populate("user", "name username email avatar")
                .populate("reviewedBy", "name username")
                .lean();

            const total = await Contribution.countDocuments(query);

            // Stats
            const statsAgg = await Contribution.aggregate([
                { $match: { del_flag: 0 } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]);

            const stats = { new: 0, reviewed: 0, accepted: 0, rejected: 0 };
            statsAgg.forEach((s) => {
                if (stats[s._id] !== undefined) stats[s._id] = s.count;
            });

            return { contributions, total, stats };
        } catch (error) {
            console.error("Error fetching contributions:", error);
            throw new ServerException("Error fetching contributions");
        }
    };

    /**
     * ADMIN: Get single contribution detail
     */
    getContributionById = async (contributionId) => {
        const contribution = await Contribution.findById(contributionId)
            .populate("user", "name username email avatar")
            .populate("reviewedBy", "name username");
        if (!contribution) throw new NotFoundException("Contribution not found");
        return contribution;
    };

    /**
     * ADMIN: Update contribution status & add admin note
     */
    updateContributionStatus = async (contributionId, adminId, { status, adminNote }) => {
        try {
            const update = { status };
            if (adminNote !== undefined) update.adminNote = adminNote;
            if (status === "accepted" || status === "rejected") {
                update.reviewedBy = adminId;
                update.reviewedAt = new Date();
            }
            const contribution = await Contribution.findByIdAndUpdate(contributionId, update, { new: true })
                .populate("user", "name username email avatar");
            if (!contribution) throw new NotFoundException("Contribution not found");
            return contribution;
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            throw new ServerException("Error updating contribution");
        }
    };

    /**
     * ADMIN: Soft delete contribution
     */
    deleteContribution = async (contributionId) => {
        const contribution = await Contribution.findByIdAndUpdate(contributionId, { del_flag: 1 }, { new: true });
        if (!contribution) throw new NotFoundException("Contribution not found");
        return { success: true };
    };
}

module.exports = new ContributionService();
