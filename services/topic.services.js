const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Topic } = require("../models");
const { default: slugify } = require("slugify");

class TopicService extends Service {
    async getAll() {
        return Topic.find({ del_flag: 0 }).sort('-createdAt');
    }

    async createTopic({ name, description }) {
        const slug = slugify(name, { lower: true, strict: true });
        return Topic.create({
            _id: new mongoose.Types.ObjectId(),
            name,
            slug,
            description,
        });
    }

    async updateTopic(id, updateData) {
        if (updateData.name) {
            updateData.slug = slugify(updateData.name, { lower: true, strict: true });
        }
        return Topic.findByIdAndUpdate(id, updateData, { new: true });
    }

    async deleteTopic(id) {
        return Topic.findByIdAndUpdate(id, { del_flag: 1 }, { new: true });
    }
}

module.exports = new TopicService();
