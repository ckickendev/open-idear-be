const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { ServerException, BadRequestException } = require("../exceptions");
const { Series, Post } = require("../models");
const { default: slugify } = require("slugify");

class SeriesService extends Service {
    async getAll() {
        const series = await Series.find({}).populate('user', 'username avatar');
        return series;
    }

    async getSeriesByUser(id) {
        if (!id) {
            throw new NotFoundException("User not found");
        }
        try {
            const series = await Series.find({ user: id, del_flag: 0 })
                .populate('user', 'username name email avatar')
                .populate('posts', 'title slug')
                .populate('image', 'url description');

            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }

    }

    async getMarkedByUser(userId) {
        if (!userId) {
            throw new NotFoundException("User not found");
        }
        try {
            const series = await Series.find({ marked: userId, del_flag: 0 })
                .populate('user', 'username name email avatar')
                .populate('posts', 'title slug')
                .populate('image', 'url description');
            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error when get marked series");
        }
    }

    async getHotSeries() {
        try {
            let MAX_HOT_SERIES = 4;
            const hotSeries = [];
            // Get posts from this week
            const now = new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30); // 10 days ago from now
            const series = await Series.find({
                del_flag: 0,
                updatedAt: {
                    $gte: sevenDaysAgo,
                    $lte: now
                }
            }).populate('user', 'username name email avatar')
                .populate('posts', 'title slug')
                .populate('image', 'url description');;

            for (const serie of series) {
                const posts = await Post.find({
                    _id: { $in: serie.posts },
                    del_flag: 0,
                    updatedAt: {
                        $gte: sevenDaysAgo,
                        $lte: now
                    }
                });

                let hotScore = 0;
                posts.forEach(post => {
                    hotScore += post.views + (post.likes ? post.likes.length * 2 : 0) + (post.comments ? post.comments.length * 3 : 0);
                });

                hotSeries.push({ series: serie, hotScore });
            }

            return hotSeries
                .sort((a, b) => b.hotScore - a.hotScore)
                .slice(0, MAX_HOT_SERIES)
                .map(item => item.series);

        } catch (error) {
            console.log('error', error);
            throw new ServerException("error when get hot series");
        }
    };

    async getSeriesBySlug(slug) {
        if (!slug) {
            throw new BadRequestException("Slug is required");
        }
        try {
            const series = await Series.findOne({ slug: slug, del_flag: 0 })
                .populate('user', 'username name email avatar')
                .populate({
                    path: 'posts',
                    select: 'title slug image category',
                    populate: [
                        {
                            path: 'category',
                            select: 'name slug' // fields from category
                        },
                        {
                            path: 'image',
                            select: 'url description' // fields from image
                        }
                    ]
                })
                .populate('image', 'url description');
            if (!series) {
                throw new NotFoundException("Series not found");
            }
            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }

    async getAnotherSeriesBySlug(slug) {
        if (!slug) {
            throw new BadRequestException("Slug is required");
        }
        try {
            const currentSeries = await Series.findOne({ slug: slug, del_flag: 0 });
            if (!currentSeries) {
                throw new NotFoundException("Series not found");
            }
            const userId = currentSeries.user;
            const anotherSeries = await Series.find({
                user: userId,
                _id: { $ne: currentSeries._id } // Exclude the current series
            })
                .limit(10)
                .populate('user', 'username name email avatar')
                .populate('posts', 'title slug')
                .populate('image', 'url description');
            return anotherSeries;
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
                posts: [],
                marked: [],
                del_flag: 0,
            });
            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }

    async editSeries(seriesId, { title, description, image }) {
        if (!seriesId) {
            throw new BadRequestException("seriesId is required");
        }
        try {
            const series = await Series.findById(seriesId);
            if (!series) {
                throw new NotFoundException("Series not found");
            }
            if (title) series.title = title;
            if (description) series.description = description;
            if (image) {
                series.image = image._id;
            }

            await series.save();
            return series;
        } catch (error) {
            console.log('error when update series', error);
            throw new ServerException("Error when update series");
        }
    }

    updateSeries = async (_id, title, description) => {
        if (!_id) {
            throw new BadRequestException("seriesId is required");
        }
        try {
            const series = await Series.findById(_id);
            if (!series) {
                throw new NotFoundException("Series not found");
            }
            if (title) {
                series.title = title;
                series.slug = slugify(title, {
                    lower: true,
                    strict: true,
                });
            }
            if (description) series.description = description;

            await series.save();
            return series.populate('user', 'username name avatar');
        } catch (error) {
            console.log('error when update series', error);
            throw new ServerException("Error when update series");
        }
    };

    async markedSeries(seriesId, userId) {
        if (!seriesId || !userId) {
            throw new BadRequestException("seriesId and userId are required");
        }
        try {
            const series = await Series.findById(seriesId);
            if (!series) {
                throw new NotFoundException("Series not found");
            }
            const isMarked = series.marked.includes(userId);
            if (isMarked) {
                // Unmark the series
                series.marked.pull(userId);
            } else {
                // Mark the series
                series.marked.push(userId);
            }
            await series.save();
            return !isMarked;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }

    async deleteSeries(seriesId) {
        if (!seriesId) {
            throw new BadRequestException("seriesId is required");
        }
        try {
            const series = await Series.findById(seriesId);
            if (!series) {
                throw new NotFoundException("Series not found");
            }
            // Soft delete: set del_flag to 1

            series.del_flag = 1;
            await series.save();
        } catch (error) {
            console.log('error when delete series', error);
            throw new ServerException("Error when delete series");
        }
    }
}

module.exports = new SeriesService();
