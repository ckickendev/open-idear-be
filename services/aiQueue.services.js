const { Service } = require("../core");
const { AIJob, MediaAsset } = require("../models");
const mongoose = require("mongoose");

class AIQueueService extends Service {
  /**
   * Enqueues a new background AI metadata job for a media asset.
   */
  async enqueue(mediaAssetId, userId, options = {}) {
    // 1. Create the queue job
    const job = new AIJob({
      mediaAssetId,
      userId,
      status: "pending",
      runAt: new Date(),
      forceOverwrite: !!options.forceOverwrite,
    });
    await job.save();

    // 2. Ensure media asset status is set to pending
    await MediaAsset.updateOne(
      { _id: mediaAssetId },
      { $set: { aiStatus: "pending", aiError: null, aiRetryCount: 0 } }
    );

    return job;
  }

  /**
   * Atomically acquires and locks the next pending job.
   */
  async acquireNextJob(workerId) {
    const now = new Date();
    return await AIJob.findOneAndUpdate(
      {
        status: "pending",
        runAt: { $lte: now },
      },
      {
        $set: {
          status: "processing",
          lockedAt: now,
          lockedBy: workerId,
        },
      },
      {
        new: true,
        sort: { createdAt: 1 }, // FIFO
      }
    );
  }

  /**
   * Marks a job as completed and updates the MediaAsset metadata.
   */
  async completeJob(jobId, mediaAssetId, aiResult, forceOverwrite = false) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // 1. Fetch current media asset to inspect existing user-written metadata
        const asset = await MediaAsset.findOne({ _id: mediaAssetId }).session(session);
        if (asset) {
          const generatedAt = new Date();

          // Prepare updates
          const updates = {
            aiStatus: "completed",
            aiError: null,
            aiMetadata: {
              altText: aiResult.altText,
              description: aiResult.description,
              tags: aiResult.tags,
              confidence: aiResult.confidence,
              model: aiResult.model || "gemini-2.0-flash",
              generatedAt,
            },
          };

          if (forceOverwrite) {
            // Overwrite all fields, clear user-edited fields tracking
            updates.altText = aiResult.altText;
            updates.description = aiResult.description;
            updates.tags = aiResult.tags;
            updates.userEditedFields = [];
          } else {
            // Auto-apply merge rules: Only overwrite fields that the user has not explicitly modified
            const editedFields = asset.userEditedFields || [];

            if (!editedFields.includes("altText")) {
              updates.altText = aiResult.altText;
            }
            if (!editedFields.includes("description")) {
              updates.description = aiResult.description;
            }
            if (!editedFields.includes("tags")) {
              updates.tags = aiResult.tags;
            }
          }

          await MediaAsset.updateOne({ _id: mediaAssetId }, { $set: updates }).session(session);
        }

        // 2. Mark the queue job as completed
        await AIJob.updateOne(
          { _id: jobId },
          { $set: { status: "completed", error: null } }
        ).session(session);
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Registers a job failure. Increments retry count and sets backoff
   * or marks it as failed if retries are exhausted.
   */
  async failJob(jobId, mediaAssetId, errorMsg) {
    const job = await AIJob.findById(jobId);
    if (!job) return;

    const newRetryCount = job.retryCount + 1;
    const isExhausted = newRetryCount >= job.maxRetries;

    if (isExhausted) {
      // Retries exhausted - mark job and media asset as failed
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await AIJob.updateOne(
            { _id: jobId },
            { $set: { status: "failed", error: errorMsg, retryCount: newRetryCount } }
          ).session(session);

          await MediaAsset.updateOne(
            { _id: mediaAssetId },
            { $set: { aiStatus: "failed", aiError: errorMsg, aiRetryCount: newRetryCount } }
          ).session(session);
        });
      } finally {
        await session.endSession();
      }
    } else {
      // Calculate exponential backoff: 30s, 60s, 120s...
      const delaySec = 30 * Math.pow(2, newRetryCount - 1);
      const nextRun = new Date(Date.now() + delaySec * 1000);

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await AIJob.updateOne(
            { _id: jobId },
            {
              $set: {
                status: "pending",
                runAt: nextRun,
                error: errorMsg,
                retryCount: newRetryCount,
                lockedAt: null,
                lockedBy: null,
              },
            }
          ).session(session);

          // Update media asset to reflect current retry count/state
          await MediaAsset.updateOne(
            { _id: mediaAssetId },
            {
              $set: {
                aiStatus: "pending",
                aiError: `Attempt ${newRetryCount} failed: ${errorMsg}`,
                aiRetryCount: newRetryCount,
              },
            }
          ).session(session);
        });
      } finally {
        await session.endSession();
      }
    }
  }

  /**
   * Recovers crashed/abandoned processing jobs (lease renewal timeout).
   */
  async recoverStuckJobs(leaseDurationMs = 5 * 60 * 1000) {
    const cutoff = new Date(Date.now() - leaseDurationMs);
    
    // Find all processing jobs locked past cutoff
    const stuckJobs = await AIJob.find({
      status: "processing",
      lockedAt: { $lt: cutoff },
    });

    let recovered = 0;
    for (const job of stuckJobs) {
      await this.failJob(
        job._id,
        job.mediaAssetId,
        `Job lease timeout: worker did not complete the job within ${leaseDurationMs / 1000}s.`
      );
      recovered++;
    }

    return recovered;
  }
}

module.exports = new AIQueueService();
