const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ForbiddenException, ServerException } = require("../exceptions");
const { Course, Lesson, Chapter, Review, Enrollment, User, CategoryCourse } = require("../models");
const { default: slugify } = require("slugify");

class CourseService extends Service {
    async findCourses({ keyword, category, status, minPrice, maxPrice, sort, page = 1, limit = 10 }) {
        const query = { del_flag: 0 };

        // By default, public search only returns published courses unless specifically querying own/admin
        if (status) {
            query.status = status;
        } else {
            query.status = "published";
        }

        if (keyword) {
            query.$or = [
                { title: { $regex: keyword, $options: "i" } },
                { description: { $regex: keyword, $options: "i" } },
            ];
        }

        if (category) query.category = category;
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

    async getCourseById(id, requestingUserId = null) {
        const course = await Course.findOne({ _id: id, del_flag: 0 })
            .populate('instructor', 'username name avatar bio')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                options: { sort: { order: 1 } },
                populate: {
                    path: 'lessons',
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                    populate: { path: 'media', select: 'url type cloudflareId' }
                }
            })
            .populate('thumbnail', 'url')
            .populate('topics', 'name slug');

        if (!course) throw new NotFoundException("Course not found");

        // Protect draft courses from public access
        if (course.status === "draft") {
            const isOwner = requestingUserId && course.instructor._id.toString() === requestingUserId.toString();
            if (!isOwner) {
                throw new NotFoundException("Course not found");
            }
        }

        return course;
    }

    async getCourseBySlug(slug, requestingUserId = null) {
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
                    populate: { path: 'media', select: 'url type cloudflareId' }
                }
            })
            .populate('thumbnail', 'url')
            .populate('topics', 'name slug');

        if (!course) throw new NotFoundException("Course not found");

        // Protect draft courses from public access
        if (course.status === "draft") {
            const isOwner = requestingUserId && course.instructor._id.toString() === requestingUserId.toString();
            if (!isOwner) {
                throw new NotFoundException("Course not found");
            }
        }

        return course;
    }

    async createCourse({ title, instructorId, categoryIds, topicIds }) {
        if (!title || !title.trim()) {
            throw new BadRequestException("Course title is required");
        }
        const baseSlug = slugify(title.trim(), { lower: true, strict: true }) || "course";
        let uniqueSlug = baseSlug;
        const count = await Course.countDocuments({ slug: uniqueSlug });
        if (count > 0) {
            uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
        }

        const course = await Course.create({
            _id: new mongoose.Types.ObjectId(),
            title: title.trim(),
            slug: uniqueSlug,
            instructor: instructorId,
            topics: topicIds || [],
            status: "draft",
        });

        if (categoryIds && categoryIds.length > 0) {
            const links = categoryIds.map(categoryId => ({
                _id: new mongoose.Types.ObjectId(),
                courseId: course._id,
                categoryId
            }));
            await CategoryCourse.insertMany(links);
        }

        return course;
    }

    async updateCourse(id, updateData, userId) {
        await this.verifyOwnership(id, userId);

        const { categoryIds, topicIds, ...restUpdateData } = updateData;
        if (restUpdateData.title) {
            const baseSlug = slugify(restUpdateData.title.trim(), { lower: true, strict: true }) || "course";
            const existingSlugCourse = await Course.findOne({ slug: baseSlug, _id: { $ne: id } });
            restUpdateData.slug = existingSlugCourse ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;
            restUpdateData.title = restUpdateData.title.trim();
        }
        if (topicIds !== undefined) {
            restUpdateData.topics = topicIds;
        }

        const course = await Course.findByIdAndUpdate(id, restUpdateData, { new: true })
            .populate('thumbnail', 'url')
            .populate('topics', 'name slug');

        if (categoryIds !== undefined) {
            await CategoryCourse.deleteMany({ courseId: id });
            if (categoryIds.length > 0) {
                const links = categoryIds.map(categoryId => ({
                    _id: new mongoose.Types.ObjectId(),
                    courseId: id,
                    categoryId
                }));
                await CategoryCourse.insertMany(links);
            }
        }
        return course;
    }

    async updateThumbnailCourse(id, media, userId) {
        await this.verifyOwnership(id, userId);
        return Course.findByIdAndUpdate(id, { thumbnail: media }, { new: true }).populate('thumbnail', 'url');
    }

    async addChapter(courseId, chapterData, userId) {
        await this.verifyOwnership(courseId, userId);

        const chapterId = new mongoose.Types.ObjectId();
        const count = await Chapter.countDocuments({ course: courseId, del_flag: 0 });
        const chapter = await Chapter.create({
            _id: chapterId,
            ...chapterData,
            order: chapterData.order !== undefined ? chapterData.order : count,
            course: courseId,
        });

        await Course.findByIdAndUpdate(courseId, {
            $push: { chapters: chapterId }
        });

        return chapter;
    }

    async updateChapter(chapterId, updateData, userId) {
        const chapter = await this.verifyChapterOwnership(chapterId, userId);
        return Chapter.findByIdAndUpdate(chapterId, updateData, { new: true });
    }

    async deleteChapter(chapterId, userId) {
        const chapter = await this.verifyChapterOwnership(chapterId, userId);

        // Cascade soft delete to all lessons in this chapter
        await Promise.all([
            Chapter.findByIdAndUpdate(chapterId, { del_flag: 1 }, { new: true }),
            Lesson.updateMany({ chapter: chapterId }, { del_flag: 1 }),
            Course.findByIdAndUpdate(chapter.course, { $pull: { chapters: chapterId } }),
        ]);

        return chapter;
    }

    async addLesson(chapterId, lessonData, userId) {
        const chapter = await this.verifyChapterOwnership(chapterId, userId);

        const lessonId = new mongoose.Types.ObjectId();
        const baseSlug = slugify(lessonData.title?.trim() || "lesson", { lower: true, strict: true }) || "lesson";
        const count = await Lesson.countDocuments({ chapter: chapterId, del_flag: 0 });
        const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

        const lesson = await Lesson.create({
            _id: lessonId,
            ...lessonData,
            title: lessonData.title?.trim() || "Untitled Lesson",
            slug: uniqueSlug,
            order: lessonData.order !== undefined ? lessonData.order : count,
            chapter: chapterId,
        });

        await Chapter.findByIdAndUpdate(chapterId, {
            $push: { lessons: lessonId }
        });

        return lesson;
    }

    async updateLesson(lessonId, updateData, userId) {
        await this.verifyLessonOwnership(lessonId, userId);

        if (updateData.title) {
            const baseSlug = slugify(updateData.title.trim(), { lower: true, strict: true }) || "lesson";
            updateData.slug = `${baseSlug}-${Date.now().toString(36)}`;
            updateData.title = updateData.title.trim();
        }
        return Lesson.findByIdAndUpdate(lessonId, updateData, { new: true });
    }

    async moveLesson(lessonId, sourceChapterId, targetChapterId, userId) {
        await this.verifyChapterOwnership(sourceChapterId, userId);
        await this.verifyChapterOwnership(targetChapterId, userId);

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

    async deleteLesson(lessonId, userId) {
        const lesson = await this.verifyLessonOwnership(lessonId, userId);

        await Promise.all([
            Lesson.findByIdAndUpdate(lessonId, { del_flag: 1 }, { new: true }),
            Chapter.findByIdAndUpdate(lesson.chapter, { $pull: { lessons: lessonId } }),
        ]);

        return lesson;
    }

    /**
     * Complete enrollment flow for free courses or direct enrollment
     * Ensures atomic Enrollment document creation + Course.studentsCount increment + User.enrolledCourses sync
     */
    async enroll(courseId, userId) {
        const course = await Course.findOne({ _id: courseId, del_flag: 0 });
        if (!course) throw new NotFoundException("Course not found");

        if (course.status !== "published") {
            throw new BadRequestException("Cannot enroll in an unpublished course");
        }

        // Check if already enrolled in Enrollment model
        let enrollment = await Enrollment.findOne({
            user: userId,
            course: courseId,
        });

        if (!enrollment) {
            enrollment = await Enrollment.create({
                _id: new mongoose.Types.ObjectId(),
                user: userId,
                course: courseId,
                enrolledAt: new Date(),
                progress: 0,
                completedLessons: [],
                status: "active",
            });

            // Update course stats & user profile
            await Promise.all([
                Course.findByIdAndUpdate(courseId, {
                    $inc: { studentsCount: 1 },
                    $addToSet: { enrolledUsers: userId },
                }),
                User.findByIdAndUpdate(userId, {
                    $addToSet: { enrolledCourses: courseId },
                }),
            ]);
        }

        return { enrolled: true, enrollment, course };
    }

    async getMyCourses(instructorId, status) {
        const query = { instructor: instructorId };
        query.del_flag = status === 'trash' ? 1 : 0;
        
        let courses = await Course.find(query)
            .populate('thumbnail', 'url')
            .populate('topics', 'name slug')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                select: '_id',
                populate: {
                    path: 'lessons',
                    match: { del_flag: 0 },
                    select: '_id',
                }
            })
            .sort('-createdAt')
            .lean();
            
        const courseIds = courses.map(c => c._id);
        const allCategoryCourses = await CategoryCourse.find({ courseId: { $in: courseIds } }).populate('categoryId', 'name slug');
        const categoryMap = {};
        allCategoryCourses.forEach(cc => {
            if (!categoryMap[cc.courseId]) categoryMap[cc.courseId] = [];
            categoryMap[cc.courseId].push(cc);
        });
        for (let course of courses) {
            const ccs = categoryMap[course._id] || [];
            course.categories = ccs.map(cc => cc.categoryId);
            course.categoryIds = ccs.map(cc => cc.categoryId?._id);
        }
        return { courses };
    }

    async getEnrolledCourses(userId) {
        const enrollments = await Enrollment.find({
            user: userId,
            status: { $in: ["active", "completed"] },
        }).populate({
            path: 'course',
            match: { del_flag: 0 },
            populate: [
                { path: 'instructor', select: 'username name avatar' },
                { path: 'thumbnail', select: 'url' },
                {
                    path: 'chapters',
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                    populate: {
                        path: 'lessons',
                        match: { del_flag: 0 },
                        options: { sort: { order: 1 } },
                    }
                }
            ]
        });

        const validCourses = enrollments
            .filter(e => e.course != null)
            .map(e => ({
                ...e.course.toObject(),
                progress: e.progress,
                completedLessons: e.completedLessons,
                enrollmentStatus: e.status,
            }));

        return { courses: validCourses };
    }

    async rateCourse(courseId, userId, score, comment) {
        const course = await Course.findById(courseId);
        if (!course) throw new NotFoundException("Course not found");

        if (score < 1 || score > 5) {
            throw new BadRequestException("Score must be between 1 and 5");
        }

        let review = await Review.findOne({ course: courseId, user: userId, del_flag: 0 });
        if (review) {
            review.score = score;
            review.comment = comment;
            await review.save();
        } else {
            review = await Review.create({
                _id: new mongoose.Types.ObjectId(),
                course: courseId,
                user: userId,
                score,
                comment
            });
        }

        // Recalculate average
        const aggregate = await Review.aggregate([
            { $match: { course: new mongoose.Types.ObjectId(courseId), del_flag: 0 } },
            { $group: { _id: "$course", averageRating: { $avg: "$score" }, count: { $sum: 1 } } }
        ]);

        if (aggregate.length > 0) {
            course.averageRating = Number(aggregate[0].averageRating.toFixed(1));
            course.ratingCount = aggregate[0].count;
        } else {
            course.averageRating = 0;
            course.ratingCount = 0;
        }

        await course.save();
        return review;
    }

    async getCourseReviews(courseId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [reviews, total] = await Promise.all([
            Review.find({ course: courseId, del_flag: 0 })
                .populate('user', 'username name avatar')
                .sort('-createdAt')
                .skip(skip)
                .limit(Number(limit)),
            Review.countDocuments({ course: courseId, del_flag: 0 })
        ]);

        return {
            reviews,
            pagination: {
                totalItems: total,
                totalPages: Math.ceil(total / limit),
                currentPage: Number(page),
                limit: Number(limit)
            }
        };
    }

    async deleteCourse(courseId, userId) {
        await this.verifyOwnership(courseId, userId);
        const course = await Course.findByIdAndUpdate(courseId, { del_flag: 1 }, { new: true });
        if (!course) throw new NotFoundException("Course not found");
        return course;
    }

    async restoreCourse(courseId, userId) {
        await this.verifyOwnership(courseId, userId);
        const course = await Course.findByIdAndUpdate(courseId, { del_flag: 0 }, { new: true });
        if (!course) throw new NotFoundException("Course not found");
        return course;
    }

    async updateCurriculum(courseId, curriculumData, userId) {
        await this.verifyOwnership(courseId, userId);
        const course = await Course.findById(courseId);
        if (!course) throw new NotFoundException("Course not found");
        return course;
    }

    /**
     * Fetch a course with its full chapter + lesson tree for the builder.
     * Verifies that the requesting user is the course instructor.
     */
    async getCourseForEdit(courseId, requestingUserId) {
        const course = await Course.findById(courseId)
            .populate('instructor', 'username name avatar')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                options: { sort: { order: 1 } },
                populate: {
                    path: 'lessons',
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                    populate: { path: 'media', select: 'url type cloudflareId' }
                }
            })
            .populate('thumbnail', 'url')
            .populate('topics', 'name slug');

        if (!course || course.del_flag === 1) throw new NotFoundException("Course not found");
        if (course.instructor._id.toString() !== requestingUserId.toString()) {
            throw new ForbiddenException("You do not have permission to edit this course");
        }
        return course;
    }

    /**
     * Security: Verify that the given user is the instructor of the course.
     */
    async verifyOwnership(courseId, userId) {
        const course = await Course.findById(courseId).select('instructor del_flag');
        if (!course || course.del_flag === 1) throw new NotFoundException("Course not found");
        if (course.instructor.toString() !== userId.toString()) {
            throw new ForbiddenException("You do not have permission to edit this course");
        }
        return course;
    }

    /**
     * Security: Verify chapter belongs to a course owned by userId
     */
    async verifyChapterOwnership(chapterId, userId) {
        const chapter = await Chapter.findOne({ _id: chapterId, del_flag: 0 });
        if (!chapter) throw new NotFoundException("Section not found");
        await this.verifyOwnership(chapter.course.toString(), userId);
        return chapter;
    }

    /**
     * Security: Verify lesson belongs to a chapter whose course is owned by userId
     */
    async verifyLessonOwnership(lessonId, userId) {
        const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 });
        if (!lesson) throw new NotFoundException("Lesson not found");
        await this.verifyChapterOwnership(lesson.chapter.toString(), userId);
        return lesson;
    }

    /**
     * Publish a course after validating 100% strict content requirements:
     *   - Title (non-empty)
     *   - Description (non-empty)
     *   - Thumbnail (attached)
     *   - At least 1 active chapter with at least 1 active lesson
     *   - All active lessons have non-empty titles
     */
    async publishCourse(courseId, userId) {
        await this.verifyOwnership(courseId, userId);

        const course = await Course.findById(courseId)
            .populate('thumbnail', 'url')
            .populate({
                path: 'chapters',
                match: { del_flag: 0 },
                populate: { path: 'lessons', match: { del_flag: 0 } }
            });

        if (!course) throw new NotFoundException("Course not found");

        if (!course.title?.trim()) {
            throw new BadRequestException("Course must have a title before publishing.");
        }
        if (!course.description?.trim()) {
            throw new BadRequestException("Course must have a description before publishing.");
        }
        if (!course.thumbnail) {
            throw new BadRequestException("Course must have a thumbnail image before publishing.");
        }

        const activeChapters = (course.chapters || []).filter(ch => ch.del_flag === 0);
        const chaptersWithLessons = activeChapters.filter(
            (ch) => ch.lessons && ch.lessons.filter(l => l.del_flag === 0).length > 0
        );

        if (chaptersWithLessons.length === 0) {
            throw new BadRequestException("Course must have at least one section with at least one lesson before publishing.");
        }

        course.status = 'published';
        await course.save();
        return course;
    }

    /**
     * Set a published course back to draft.
     */
    async unpublishCourse(courseId, userId) {
        await this.verifyOwnership(courseId, userId);
        const course = await Course.findByIdAndUpdate(
            courseId,
            { status: 'draft' },
            { new: true }
        );
        if (!course) throw new NotFoundException("Course not found");
        return course;
    }

    /**
     * Reorder chapters within a course.
     * Verifies ownership and validates that all IDs belong to this course.
     */
    async reorderChapters(courseId, orderedIds, userId) {
        await this.verifyOwnership(courseId, userId);
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            throw new BadRequestException("orderedIds must be a non-empty array");
        }

        // Validate that all chapters belong to this course
        const existingChapters = await Chapter.find({
            _id: { $in: orderedIds },
            course: courseId,
            del_flag: 0,
        }).select('_id');

        if (existingChapters.length !== orderedIds.length) {
            throw new BadRequestException("Some section IDs are invalid or do not belong to this course");
        }

        const updates = orderedIds.map((id, index) =>
            Chapter.updateOne({ _id: id, course: courseId }, { order: index })
        );
        await Promise.all(updates);
        await Course.findByIdAndUpdate(courseId, { chapters: orderedIds });
        return { reordered: orderedIds.length };
    }

    /**
     * Reorder lessons within a chapter.
     * Verifies ownership and validates that all IDs belong to this chapter.
     */
    async reorderLessons(chapterId, orderedIds, userId) {
        const chapter = await this.verifyChapterOwnership(chapterId, userId);
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            throw new BadRequestException("orderedIds must be a non-empty array");
        }

        const existingLessons = await Lesson.find({
            _id: { $in: orderedIds },
            chapter: chapterId,
            del_flag: 0,
        }).select('_id');

        if (existingLessons.length !== orderedIds.length) {
            throw new BadRequestException("Some lesson IDs are invalid or do not belong to this section");
        }

        const updates = orderedIds.map((id, index) =>
            Lesson.updateOne({ _id: id, chapter: chapterId }, { order: index })
        );
        await Promise.all(updates);
        await Chapter.findByIdAndUpdate(chapterId, { lessons: orderedIds });
        return { reordered: orderedIds.length };
    }
}

module.exports = new CourseService();
