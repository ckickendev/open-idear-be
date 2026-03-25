const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ServerException } = require("../exceptions");
const { Course, Lesson, Chapter } = require("../models");
const { default: slugify } = require("slugify");

class CourseService extends Service {
    async findCourses({ keyword, category, status, minPrice, maxPrice, sort, page = 1, limit = 10 }) {
        const query = { del_flag: 0 };

        if (keyword) {
            query.$or = [
                { title: { $regex: keyword, $options: "i" } },
                { description: { $regex: keyword, $options: "i" } },
            ];
        }

        if (category) query.category = category;
        if (status) query.status = status;
        if (minPrice !== undefined || maxPrice !== undefined) {
            query.price = {};
            if (minPrice !== undefined) query.price.$gte = Number(minPrice);
            if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
        }

        const skip = (page - 1) * limit;
        const sortOptions = sort ? sort.split(',').join(' ') : '-createdAt';

        const [courses, total] = await Promise.all([
            Course.find(query)
                .populate('instructor', 'username name avatar')
                .populate('category', 'name slug')
                .populate('thumbnail', 'url')
                .sort(sortOptions)
                .skip(skip)
                .limit(Number(limit)),
            Course.countDocuments(query)
        ]);

        return {
            courses,
            pagination: {
                totalItems: total,
                totalPages: Math.ceil(total / limit),
                currentPage: Number(page),
                limit: Number(limit)
            }
        };
    }

    async getAll() {
        return this.findCourses({});
    }

    async getCourseById(id) {
        const course = await Course.findById(id)
            .populate('instructor', 'username name avatar bio')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                options: { sort: { order: 1 } },
                populate: {
                    path: 'lessons',
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                    populate: { path: 'media', select: 'url type' }
                }
            })
            .populate('thumbnail', 'url');

        if (!course) throw new NotFoundException("Course not found");
        return course;
    }

    async getCourseBySlug(slug) {
        const course = await Course.findOne({ slug, del_flag: 0 })
            .populate('instructor', 'username name avatar bio')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                options: { sort: { order: 1 } },
                populate: {
                    path: 'lessons',
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                    populate: { path: 'media', select: 'url type' }
                }
            })
            .populate('thumbnail', 'url');

        if (!course) throw new NotFoundException("Course not found");
        return course;
    }

    async createCourse({ title, instructorId }) {
        const slug = slugify(title, { lower: true, strict: true });
        return Course.create({
            _id: new mongoose.Types.ObjectId(),
            title,
            slug,
            instructor: instructorId,
        });
    }

    async updateCourse(id, updateData) {
        if (updateData.title) {
            updateData.slug = slugify(updateData.title, { lower: true, strict: true });
        }
        return Course.findByIdAndUpdate(id, updateData, { new: true }).populate('thumbnail', 'url');;;
    }

    async updateThumbnailCourse(id, media) {
        return Course.findByIdAndUpdate(id, { thumbnail: media }, { new: true }).populate('thumbnail', 'url');
    }

    async addChapter(courseId, chapterData) {
        const chapterId = new mongoose.Types.ObjectId();
        const chapter = await Chapter.create({
            _id: chapterId,
            ...chapterData,
            course: courseId,
        });

        await Course.findByIdAndUpdate(courseId, {
            $push: { chapters: chapterId }
        });

        return chapter;
    }

    async updateChapter(chapterId, updateData) {
        return Chapter.findByIdAndUpdate(chapterId, updateData, { new: true });
    }

    async deleteChapter(chapterId) {
        return Chapter.findByIdAndUpdate(chapterId, { del_flag: 1 }, { new: true });
    }

    async addLesson(chapterId, lessonData) {
        const lessonId = new mongoose.Types.ObjectId();
        const slug = slugify(lessonData.title, { lower: true, strict: true });
        const lesson = await Lesson.create({
            _id: lessonId,
            ...lessonData,
            slug,
            chapter: chapterId,
        });

        await Chapter.findByIdAndUpdate(chapterId, {
            $push: { lessons: lessonId }
        });

        return lesson;
    }

    async updateLesson(lessonId, updateData) {
        if (updateData.title) {
            updateData.slug = slugify(updateData.title, { lower: true, strict: true });
        }
        return Lesson.findByIdAndUpdate(lessonId, updateData, { new: true });
    }

    async moveLesson(lessonId, sourceChapterId, targetChapterId) {
        // Remove from source chapter
        await Chapter.findByIdAndUpdate(sourceChapterId, {
            $pull: { lessons: lessonId }
        });
        
        // Add to target chapter
        await Chapter.findByIdAndUpdate(targetChapterId, {
            $push: { lessons: lessonId }
        });

        // Update lesson's chapter reference
        return Lesson.findByIdAndUpdate(lessonId, { chapter: targetChapterId }, { new: true });
    }

    async deleteLesson(lessonId) {
        return Lesson.findByIdAndUpdate(lessonId, { del_flag: 1 }, { new: true });
    }

    async enroll(courseId, userId) {
        const course = await Course.findById(courseId);
        if (!course) throw new NotFoundException("Course not found");

        if (!course.enrolledUsers.includes(userId)) {
            course.enrolledUsers.push(userId);
            await course.save();
        }
        return course;
    }

    async getMyCourses(instructorId) {
        const courses = await Course.find({ instructor: instructorId, del_flag: 0 })
            .populate('category', 'name slug')
            .populate('thumbnail', 'url')
            .sort('-createdAt');
        return { courses };
    }

    async getEnrolledCourses(userId) {
        const courses = await Course.find({ enrolledUsers: userId, del_flag: 0 })
            .populate('instructor', 'username name avatar')
            .populate('thumbnail', 'url')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                options: { sort: { order: 1 } },
                populate: {
                    path: 'lessons',
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                }
            })
            .sort('-createdAt');
        return { courses };
    }
}

module.exports = new CourseService();
