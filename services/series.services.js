const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { ServerException, BadRequestException } = require("../exceptions");
const { Series } = require("../models");

class SeriesService extends Service {
    async getAll() {
        const tags = await Series.find({});
        return tags;
    }

    async getSeriesByUser(userId) {
        if (!userId) {
            throw new NotFoundException("User not found");
        }
        try {
            const series = await Series.find({ user: userId })
                .populate('post')
                .populate('user', 'username email');

            const returnSeries = series.map(serie => {
                return {
                    _id: serie._id,
                    title: serie.title,
                    description: serie.description,
                    user: {
                        name: serie.user.name,
                        avatar: serie.user.avatar,
                    },
                    post: serie.post.map(post => ({
                        _id: post._id,
                        title: post.title,
                        slug: post.slug,
                    })),
                    createdAt: serie.createdAt,
                };
            });

            return returnSeries;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }

    async createSeries({ title, slug, userId }) {
        if (!title || !slug || !userId) {
            throw new BadRequestException("Title, slug and userId are required");
        }
        try {
            const series = await Series.create({
                _id: new mongoose.Types.ObjectId(),
                title,
                slug,
                description: "",
                user: userId,
                post: [],
            });
            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }
}

module.exports = new SeriesService();
