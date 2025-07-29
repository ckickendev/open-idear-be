const { Service } = require("../core");
const { Media } = require("../models");
const mongoose = require("mongoose");

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

    async addMedia(userId, url, type, description) {
        const types = ["image", "video", "audio"];
        if (!types.includes(type)) {
            throw new Error("Invalid media type");
        }
        const media = new Media({
            _id: new mongoose.Types.ObjectId(),
            user: userId,
            url,
            type,
            description
        });
        await media.save();
        return media;
    }
}

module.exports = new MediaService();
