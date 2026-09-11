const mongoose = require("mongoose");
const crypto = require("crypto");
const { Service } = require("../core");
const { AIJob } = require("../models");

class AIJobService extends Service {
    /**
     * Compute a deterministic fingerprint for job deduplication and idempotency
     */
    computeFingerprint({ lessonId, sourceMediaId, sourceMediaVersion, capability, language = "vi", promptVersion = "v1.0" }) {
        const raw = `${lessonId || ""}_${sourceMediaId || "none"}_${sourceMediaVersion || 1}_${capability}_${language}_${promptVersion}`;
        return crypto.createHash("sha256").update(raw).digest("hex");
    }

    /**
     * Create or retrieve an existing idempotent AI job
     */
    async createOrFindJob({
        type = "course_intelligence",
        capability,
        user,
        course = null,
        lesson = null,
        sourceMedia = null,
        sourceMediaVersion = 1,
        inputFingerprint,
        provider = "gemini",
        model = "gemini-2.5-flash",
        promptVersion = "v1.0",
        forceOverwrite = false,
    }) {
        if (!inputFingerprint) {
            inputFingerprint = this.computeFingerprint({
                lessonId: lesson?._id?.toString() || lesson?.toString(),
                sourceMediaId: sourceMedia?._id?.toString() || sourceMedia?.toString(),
                sourceMediaVersion,
                capability,
                promptVersion,
            });
        }

        // 1. If not forcing overwrite, check for active or completed job with identical fingerprint
        if (!forceOverwrite) {
            const inFlight = await AIJob.findOne({
                inputFingerprint,
                status: { $in: ["queued", "processing"] },
                createdAt: { $gte: new Date(Date.now() - 3 * 60 * 1000) }, // within 3 minutes
            }).sort("-createdAt");

            if (inFlight) {
                return { job: inFlight, isExisting: true, isProcessing: true };
            }

            const completed = await AIJob.findOne({
                inputFingerprint,
                status: "completed",
            }).sort("-createdAt");

            if (completed) {
                return { job: completed, isExisting: true, isProcessing: false };
            }
        }

        // 2. Create new job record
        const job = new AIJob({
            _id: new mongoose.Types.ObjectId(),
            type,
            capability,
            user,
            course,
            lesson,
            sourceMedia,
            sourceMediaVersion,
            inputFingerprint,
            provider,
            model,
            promptVersion,
            attempts: 1,
            maxAttempts: 3,
            status: "processing",
            startedAt: new Date(),
            forceOverwrite,
        });

        await job.save();
        return { job, isExisting: false, isProcessing: true };
    }

    /**
     * Mark AI job as completed with output reference
     */
    async completeJob(jobId, outputReference = null) {
        if (!jobId) return null;
        return await AIJob.findByIdAndUpdate(
            jobId,
            {
                status: "completed",
                completedAt: new Date(),
                outputReference: outputReference || undefined,
            },
            { new: true }
        );
    }

    /**
     * Mark AI job as failed with sanitized error information
     */
    async failJob(jobId, error, errorCode = "AI_EXECUTION_ERROR") {
        if (!jobId) return null;

        // Sanitize error string to prevent secret / token leakage
        let safeErrorMessage = typeof error === "string" ? error : error?.message || "Unknown AI error";
        safeErrorMessage = safeErrorMessage.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "[REDACTED_TOKEN]");
        safeErrorMessage = safeErrorMessage.replace(/key=[A-Za-z0-9_\-]+/gi, "key=[REDACTED_KEY]");

        return await AIJob.findByIdAndUpdate(
            jobId,
            {
                status: "failed",
                error: safeErrorMessage,
                errorCode,
                completedAt: new Date(),
            },
            { new: true }
        );
    }
}

module.exports = new AIJobService();
