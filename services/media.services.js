const { Service } = require("../core");
const { Media } = require("../models");
const mongoose = require("mongoose");
const axios = require("axios");

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
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;

        if (!accountId || !apiToken || accountId === 'your_account_id_here' || apiToken === 'your_api_token_here') {
            throw new Error("Cloudflare credentials are not configured in .env");
        }

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
            console.log(1);

            if (response.data.success) {
                return response.data.result;
            } else {
                throw new Error(response.data.errors[0].message);
            }
        } catch (error) {
            console.error("Cloudflare API error:", error.response?.data || error.message);
            throw new Error("Failed to generate Cloudflare upload URL: " + (error.response?.data?.errors?.[0]?.message || error.message));
        }
    }
}

module.exports = new MediaService();
