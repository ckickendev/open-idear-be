const express = require("express");
const { Controller } = require("../core");
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
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
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

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.post(`${this._rootPath}/uploadImage`, AuthMiddleware, upload.single("image"), this.uploadImage);
    };
}

module.exports = MediaController;