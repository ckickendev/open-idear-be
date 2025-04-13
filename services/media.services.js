const { Service } = require("../core");
const { Media } = require("../models");

class MediaService extends Service {
    async getAll() {
        const medias = await Media.find({});
        return medias;
    }
}

module.exports = new MediaService();
