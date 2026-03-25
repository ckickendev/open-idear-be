const express = require("express");
const { Controller, ConsoleLogger } = require("../core");
const { mediaService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const multer = require("multer");
const cloudinary = require("../utils/cloudinary"); // Make sure this path is correct
const { AuthMiddleware } = require("../middlewares/auth.middleware");
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

    getCloudflareUploadUrl = asyncHandler(async (req, res) => {
        ConsoleLogger.info("Start getCloudflareUploadUrl")
        try {
            const result = await mediaService.getCloudflareUploadUrl(req.userInfo._id);
            res.json({
                status: "success",
                data: result
            });
        } catch (error) {
            res.status(500).json({ error: "Failed to get upload URL", details: error.message });
        }
    });

    saveCloudflareVideo = asyncHandler(async (req, res) => {
        ConsoleLogger.info("start saveCloudflareVideo")
        const { videoId, title, description } = req.body;
        if (!videoId) {
            return res.status(400).json({ error: "videoId is required" });
        }

        try {
            // In Cloudflare Stream, the playback URL can be constructed from the videoId
            const playbackUrl = `https://customer-<ACCOUNT_ID>.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
            // Note: <ACCOUNT_ID> should be replaced or handled in frontend/player

            const newMedia = await mediaService.addMedia(
                req.userInfo._id,
                videoId, // Using videoId as the URL/identifier for now
                "video",
                description || title || "Cloudflare Video",
                videoId
            );

            res.json({
                status: "success",
                data: newMedia
            });
        } catch (error) {
            res.status(500).json({ error: "Failed to save media", details: error.message });
        }
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.get(`${this._rootPath}/user`, AuthMiddleware, this.getByUser);
        this._router.post(`${this._rootPath}/uploadImage`, AuthMiddleware, upload.single("image"), this.uploadImage);
        this._router.post(`${this._rootPath}/cloudflare/upload-url`, AuthMiddleware, this.getCloudflareUploadUrl);
        this._router.post(`${this._rootPath}/cloudflare/save`, AuthMiddleware, this.saveCloudflareVideo);
    };
}

module.exports = MediaController;