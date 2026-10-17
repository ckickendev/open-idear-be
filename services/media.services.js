const { Service } = require("../core");
const { Media, Lesson } = require("../models");
const mongoose = require("mongoose");
const axios = require("axios");
const cloudinary = require("../utils/cloudinary");

class MediaService extends Service {
    async getAll() {
        const medias = await Media.find({});
        return medias;
    }

    async getMediaById(mediaId) {
        const media = await Media.findById(mediaId);
        if (!media) {
            throw new Error("Media not found");
        }
        return media;
    }

    async getMediaByUser(userId) {
        const medias = await Media.find({ user: userId });
        if (medias.length === 0) {
            throw new Error("No media found for this user");
        }
        return medias;
    }

    async addMedia(userId, url, type, description, cloudflareId = null) {
        const types = ["image", "video", "audio", "file"];
        if (!types.includes(type)) {
            throw new Error("Invalid media type");
        }
        const media = new Media({
            _id: new mongoose.Types.ObjectId(),
            user: userId,
            url,
            type,
            description,
            // We can store cloudflareId in the metadata or just use the url field
            // For now, let's assume if it's cloudflare, URL is thePlayback URL or internal reference
        });
        await media.save();
        return media;
    }

    async getCloudflareUploadUrl(userId) {
        console.log("start getCloudflareUploadUrl services");
        const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
        const apiToken = (process.env.CLOUDFLARE_API_TOKEN || "").trim();

        if (!accountId || !apiToken || accountId === 'your_account_id_here' || apiToken === 'your_api_token_here') {
            throw new Error("Cloudflare credentials are not configured in .env");
        }

        const maskedToken = apiToken.length > 8 ? `${apiToken.slice(0, 4)}...${apiToken.slice(-4)}` : '***';
        console.log("accountId:", accountId, "apiToken:", maskedToken);

        try {
            const response = await axios.post(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
                {
                    maxDurationSeconds: 3600, // 1 hour max
                    expiry: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 mins expiry
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (response.data.success) {
                return response.data.result;
            } else {
                const errMsg = response.data.errors?.[0]?.message || "Cloudflare direct upload failed";
                throw new Error(errMsg);
            }
        } catch (error) {
            const cfErrors = error.response?.data?.errors;
            const cfMsg = Array.isArray(cfErrors) && cfErrors.length > 0 ? cfErrors.map(e => e.message || e.code).join(", ") : null;
            const finalMsg = cfMsg || error.response?.data?.messages?.[0] || error.message;
            console.error("Cloudflare API error:", error.response?.data || error.message);
            throw new Error(`Failed to generate Cloudflare upload URL: ${finalMsg}`);
        }
    }

    async deleteMedia(mediaId, userId) {
        const media = await Media.findOne({ _id: mediaId, user: userId });
        if (!media) {
            throw new Error("Media not found or unauthorized");
        }

        // 1. Delete from Cloudinary if hosted there
        if (media.url && typeof media.url === "string" && media.url.includes("cloudinary.com")) {
            try {
                const uploadIdx = media.url.indexOf("/upload/");
                if (uploadIdx !== -1) {
                    const pathAfterUpload = media.url.substring(uploadIdx + "/upload/".length);
                    let resourceType = "video";
                    if (media.url.includes("/image/upload/")) {
                        resourceType = "image";
                    } else if (media.url.includes("/raw/upload/")) {
                        resourceType = "raw";
                    }

                    let clean = pathAfterUpload.split(/[?#]/)[0];
                    clean = clean.replace(/^(?:[a-zA-Z0-9_]+_[a-zA-Z0-9_-]+(?:,[a-zA-Z0-9_]+_[a-zA-Z0-9_-]+)*\/)*/, "");
                    clean = clean.replace(/^v\d+\//, "");
                    clean = clean.replace(/\.[^/.]+$/, "");
                    const publicId = decodeURIComponent(clean);

                    if (publicId) {
                        const res = await cloudinary.uploader.destroy(publicId, {
                            resource_type: resourceType,
                            invalidate: true,
                        });
                        if (res?.result === "not found" && resourceType === "video") {
                            await cloudinary.uploader.destroy(publicId, {
                                resource_type: "image",
                                invalidate: true,
                            });
                        }
                    }
                }
            } catch (cldErr) {
                console.warn(`[Cloudinary] Failed to delete media ${mediaId}:`, cldErr.message);
            }
        }

        // 2. Delete from Cloudflare Stream
        const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
        const apiToken = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
        const cfId = media.cloudflareId || (media.url && !media.url.includes("://") ? media.url : null);
        if (cfId && accountId && apiToken) {
            try {
                await axios.delete(
                    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${cfId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${apiToken}`,
                        },
                    }
                );
            } catch (cfErr) {
                console.warn(`[Cloudflare] Failed to delete video ${cfId}:`, cfErr.response?.data || cfErr.message);
            }
        }

        // 3. Unlink from any lessons that reference this media
        if (Lesson) {
            await Lesson.updateMany({ media: mediaId }, { $unset: { media: 1 } });
        }

        // 4. Delete from Database
        await Media.findByIdAndDelete(mediaId);
        return { success: true };
    }
}

module.exports = new MediaService();
