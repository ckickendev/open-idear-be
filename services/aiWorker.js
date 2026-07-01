const crypto = require("crypto");
const { AIJob, MediaAsset } = require("../models");
const aiQueueService = require("./aiQueue.services");
const aiAnalysisService = require("./aiAnalysis.services");

class AIWorker {
  constructor() {
    this.workerId = `worker_${crypto.randomBytes(4).toString("hex")}`;
    this.running = false;
    this.timer = null;
    this.pollIntervalMs = 5000; // 5 seconds
    this.leaseDurationMs = 5 * 60 * 1000; // 5 minutes lease timeout
  }

  /**
   * Starts the polling worker loop.
   */
  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[AIWorker] Started background daemon (Worker ID: ${this.workerId})`);
    this._runLoop();
  }

  /**
   * Stops the polling worker loop.
   */
  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[AIWorker] Stopped background daemon`);
  }

  /**
   * Main loops execution sequence.
   */
  async _runLoop() {
    if (!this.running) return;

    try {
      // 1. Recover any stuck jobs from crashed worker instances
      await aiQueueService.recoverStuckJobs(this.leaseDurationMs);

      // 2. Poll and lock the next eligible job
      const job = await aiQueueService.acquireNextJob(this.workerId);
      
      if (job) {
        console.log(`[AIWorker] Locked job ${job._id} for media asset ${job.mediaAssetId}`);
        await this._processJob(job);
        
        // Immediately try to process next job without delay
        this.timer = setTimeout(() => this._runLoop(), 0);
        return;
      }
    } catch (err) {
      console.error("[AIWorker] Error in worker polling loop:", err.message);
    }

    // Schedule next regular poll
    this.timer = setTimeout(() => this._runLoop(), this.pollIntervalMs);
  }

  /**
   * Processes a single enqueued job.
   */
  async _processJob(job) {
    const { _id: jobId, mediaAssetId } = job;

    try {
      // 1. Update MediaAsset status to processing
      await MediaAsset.updateOne(
        { _id: mediaAssetId },
        { $set: { aiStatus: "processing", aiError: null } }
      );

      // 2. Fetch target MediaAsset details
      const asset = await MediaAsset.findOne({ _id: mediaAssetId, del_flag: 0 });
      if (!asset) {
        throw new Error(`Media asset ${mediaAssetId} not found or has been soft-deleted.`);
      }

      // 3. Determine best image URL to analyze (prefer medium thumbnail to save bandwidth)
      const imageUrl = asset.urls.thumbnail_md || asset.urls.webp || asset.urls.original;
      if (!imageUrl) {
        throw new Error("No valid storage URLs found on media asset.");
      }

      console.log(`[AIWorker] Fetching and analyzing image: ${imageUrl} (${asset.mimeType})`);

      // 4. Download buffer and execute multimodal Gemini analysis
      const analysisResult = await aiAnalysisService.analyzeImage(imageUrl, asset.mimeType);

      console.log(`[AIWorker] Analysis succeeded for job ${jobId}. AltText length: ${analysisResult.altText.length}, Tags count: ${analysisResult.tags.length}`);

      // 5. Run OCR analysis in parallel/sequence
      try {
        console.log(`[AIWorker] Running OCR analysis for media asset ${mediaAssetId}...`);
        const { ocrService } = require("./ocr.services");
        await ocrService.processAssetOCR(mediaAssetId);
      } catch (ocrErr) {
        console.error(`[AIWorker] OCR processing failed for asset ${mediaAssetId}:`, ocrErr.message);
        // Graceful fallback: do not block visual completion updates if OCR fails
      }

      // 6. Complete job and update asset values in database
      await aiQueueService.completeJob(jobId, mediaAssetId, analysisResult, job.forceOverwrite);

    } catch (err) {
      console.error(`[AIWorker] Failed to process job ${jobId}:`, err.message);
      
      // Attempt to gracefully fail/retry the job
      try {
        await aiQueueService.failJob(jobId, mediaAssetId, err.message);
      } catch (failErr) {
        console.error(`[AIWorker] Critical failure trying to register job error state:`, failErr.message);
      }
    }
  }
}

module.exports = new AIWorker();
