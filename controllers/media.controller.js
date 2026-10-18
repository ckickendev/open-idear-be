const express = require("express");
const { Controller, ConsoleLogger } = require("../core");
const { mediaService, bunnyStreamService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const multer = require("multer");
const cloudinary = require("../utils/cloudinary");
const { AuthMiddleware, OptionalAuthMiddleware } = require("../middlewares/auth.middleware");
// Remove streamifier import - not needed

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for videos/files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/mpeg', 'video/quicktime',
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type: ' + file.mimetype), false);
        }
    }
});

class MediaController extends Controller {
    _rootPath = "/media";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const mediaList = await mediaService.getAll();
        res.json({
            status: "success",
            data: mediaList,
        });
    });

    getByUser = asyncHandler(async (req, res) => {
        try {
            const mediaList = await mediaService.getMediaByUser(req.userInfo._id);
            res.json({
                status: "success",
                data: mediaList,
            });
        } catch (error) {
            if (error.message === "No media found for this user") {
                return res.json({
                    status: "success",
                    data: [],
                });
            }
            res.status(500).json({ error: "Failed to fetch media", details: error.message });
        }
    });

    uploadImage = asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        try {
            const uploadFromBuffer = (buffer) => {
                return new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        {
                            resource_type: "auto",
                            folder: "uploads",
                        },
                        (error, result) => {
                            if (result) {
                                resolve(result);
                            } else {
                                reject(error);
                            }
                        }
                    ).end(buffer);
                });
            };

            const result = await uploadFromBuffer(req.file.buffer);

            const newMedia = await mediaService.addMedia(
                req.userInfo._id,
                result.secure_url,
                "image",
                req.body.description || "Uploaded image"
            );

            res.json({
                status: "success",
                image: newMedia,
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({
                error: "Upload failed",
                details: error.message
            });
        }
    });

    // ─── Bunny Stream Endpoints ──────────────────────────────────────────────

    /**
     * Authorizes a direct client-side TUS resumable upload to Bunny Stream.
     * Generates a time-limited SHA-256 signature and pre-creates the Media record.
     */
    getBunnyUploadSignature = asyncHandler(async (req, res) => {
        ConsoleLogger.info("Start getBunnyUploadSignature");
        try {
            const { title, collectionId, idempotencyKey, courseId, lessonId } = req.body;
            const result = await bunnyStreamService.authorizeUpload(req.userInfo._id, {
                title,
                collectionId,
                idempotencyKey,
                courseId,
                lessonId,
            });
            res.json({
                status: "success",
                data: result,
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({
                status: "error",
                message: error.message,
            });
        }
    });

    /**
     * Persists uploaded video metadata once client finishes uploading to Bunny Stream.
     */
    saveBunnyVideo = asyncHandler(async (req, res) => {
        ConsoleLogger.info("Start saveBunnyVideo");
        const { videoId, title, description, duration } = req.body;
        if (!videoId) {
            return res.status(400).json({ status: "error", message: "videoId is required" });
        }

        try {
            const media = await bunnyStreamService.saveUploadedVideo(req.userInfo._id, {
                videoId,
                title,
                description,
                duration,
            });
            res.json({
                status: "success",
                data: media,
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({
                status: "error",
                message: error.message,
            });
        }
    });

    /**
     * Retrieves secure signed playback configuration (embed URL, HLS, thumbnails).
     * Enforces enrollment and free-preview authorization.
     */
    getBunnyPlayback = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        try {
            const config = await bunnyStreamService.getPlaybackConfig(lessonId, req.userInfo?._id);
            res.json({
                status: "success",
                data: config,
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({
                status: "error",
                code: error.code || "PLAYBACK_ERROR",
                message: error.message,
            });
        }
    });

    /**
     * Checks remote video processing/encoding status from Bunny Stream.
     */
    getBunnyStatus = asyncHandler(async (req, res) => {
        const { videoId } = req.params;
        try {
            const statusData = await bunnyStreamService.getVideoStatus(videoId);
            res.json({
                status: "success",
                data: statusData,
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({
                status: "error",
                message: error.message,
            });
        }
    });

    /**
     * Inbound webhook handler for Bunny Stream encoding and caption status updates.
     */
    handleBunnyWebhook = asyncHandler(async (req, res) => {
        const signatureHeader = req.headers["x-bunnystream-signature"] || req.headers["signature"] || "";
        const rawBodyOrPayload = req.rawBody || req.body;
        try {
            const result = await bunnyStreamService.handleWebhook(rawBodyOrPayload, signatureHeader);
            res.json({
                status: "success",
                data: result,
            });
        } catch (error) {
            res.status(error.statusCode || 400).json({
                status: "error",
                message: error.message,
            });
        }
    });

    /**
     * Deletes a Bunny video asset and unlinks it from lessons.
     */
    deleteBunnyVideo = asyncHandler(async (req, res) => {
        const { id } = req.params;
        try {
            await bunnyStreamService.deleteVideoAsset(id, req.userInfo._id);
            res.json({
                status: "success",
                message: "Video deleted successfully",
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({
                status: "error",
                message: error.message,
            });
        }
    });

    // ─── Legacy Cloudflare Endpoints (Decommissioned / Inactive Historical Reference) ─────────
    /**
     * @deprecated Cloudflare Stream has been completely migrated to Bunny Stream.
     */
    getCloudflareUploadUrl = asyncHandler(async (req, res) => {
        ConsoleLogger.warn("[Deprecated] Attempt to access legacy getCloudflareUploadUrl endpoint");
        return res.status(410).json({
            status: "error",
            code: "PROVIDER_DEPRECATED",
            message: "Cloudflare Stream has been deprecated and decommissioned. All video uploads must use Bunny Stream (/media/bunny/upload-signature).",
        });
    });

    /**
     * @deprecated Cloudflare Stream has been completely migrated to Bunny Stream.
     */
    saveCloudflareVideo = asyncHandler(async (req, res) => {
        ConsoleLogger.warn("[Deprecated] Attempt to access legacy saveCloudflareVideo endpoint");
        return res.status(410).json({
            status: "error",
            code: "PROVIDER_DEPRECATED",
            message: "Cloudflare Stream has been deprecated and decommissioned. All video metadata persistence must use Bunny Stream (/media/bunny/save).",
        });
    });

    deleteMedia = asyncHandler(async (req, res) => {
        const { id } = req.params;
        await mediaService.deleteMedia(id, req.userInfo._id);
        res.json({
            status: "success",
            message: "Media deleted successfully",
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.get(`${this._rootPath}/user`, AuthMiddleware, this.getByUser);
        this._router.post(`${this._rootPath}/uploadImage`, AuthMiddleware, upload.single("image"), this.uploadImage);

        // ── Bunny Stream Routes ──
        this._router.post(`${this._rootPath}/bunny/upload-signature`, AuthMiddleware, this.getBunnyUploadSignature);
        this._router.post(`${this._rootPath}/bunny/save`, AuthMiddleware, this.saveBunnyVideo);
        this._router.get(`${this._rootPath}/bunny/playback/:lessonId`, OptionalAuthMiddleware, this.getBunnyPlayback);
        this._router.get(`${this._rootPath}/bunny/status/:videoId`, OptionalAuthMiddleware, this.getBunnyStatus);
        this._router.post(`${this._rootPath}/bunny/webhook`, this.handleBunnyWebhook);
        this._router.delete(`${this._rootPath}/bunny/:id`, AuthMiddleware, this.deleteBunnyVideo);

        // ── Deprecated Cloudflare Routes ──
        this._router.post(`${this._rootPath}/cloudflare/upload-url`, AuthMiddleware, this.getCloudflareUploadUrl);
        this._router.post(`${this._rootPath}/cloudflare/save`, AuthMiddleware, this.saveCloudflareVideo);

        this._router.delete(`${this._rootPath}/:id`, AuthMiddleware, this.deleteMedia);
    };
}

module.exports = MediaController;