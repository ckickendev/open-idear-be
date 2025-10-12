const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { ServerException, BadRequestException } = require("../exceptions");
const { Series } = require("../models");

class SeriesService extends Service {
    async getAll() {
        const tags = await Series.find({});
        return tags;
    }

    async getSeriesByUser(id) {
        if (!id) {
            throw new NotFoundException("User not found");
        }
        try {
            const series = await Series.find({ user: id })
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
            const series = await Series.find({ marked: userId })
                .populate('user', 'username name email avatar')
                .populate('posts', 'title slug')
                .populate('image', 'url description');
            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error when get marked series");
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
                if (image) series.image = image._id;
            }
            
            await series.save();
            return series;
        } catch (error) {
            console.log('error when update series', error);
            throw new ServerException("Error when update series");
        }
    }

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
}

module.exports = new SeriesService();
