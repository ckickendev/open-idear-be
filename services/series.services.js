const { Service } = require("../core");
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
}

module.exports = new SeriesService();
