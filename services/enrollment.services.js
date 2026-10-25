const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException } = require("../exceptions");
const { Enrollment, Course, Chapter, Lesson } = require("../models");

class EnrollmentService extends Service {
    /**
     * Check if a user can access a specific course
     */
    async canAccessCourse(userId, courseId) {
        const enrollment = await Enrollment.findOne({
            user: userId,
            course: courseId,
            status: { $in: ["active", "completed"] },
        });
        return !!enrollment;
    }

    /**
     * Get a single enrollment with progress info
     */
    async getEnrollment(userId, courseId) {
        const enrollment = await Enrollment.findOne({
            user: userId,
            course: courseId,
        }).populate({
            path: "course",
            populate: [
                { path: "instructor", select: "username name avatar" },
                { path: "thumbnail", select: "url" },
                {
                    path: "chapters",
                    match: { del_flag: 0 },
                    options: { sort: { order: 1 } },
                    populate: {
                        path: "lessons",
                        match: { del_flag: 0 },
                        options: { sort: { order: 1 } },
                        select: "title slug type order",
                    },
                },
            ],
        });

        if (!enrollment) throw new NotFoundException("Enrollment not found");

        // Reconcile progress dynamically if out of sync with actual lesson count
        try {
            const totalLessons = await this._getTotalLessons(courseId);
            if (totalLessons > 0) {
                const actualProgress = Math.min(
                    100,
                    Math.round(((enrollment.completedLessons?.length || 0) / totalLessons) * 100)
                );
                if (enrollment.progress !== actualProgress) {
                    enrollment.progress = actualProgress;
                    if (actualProgress >= 100) {
                        enrollment.status = "completed";
                        if (!enrollment.completedAt) enrollment.completedAt = new Date();
                    } else if (enrollment.status === "completed") {
                        enrollment.status = "active";
                        enrollment.completedAt = null;
                    }
                    await Enrollment.updateOne(
                        { _id: enrollment._id },
                        {
                            $set: {
                                progress: actualProgress,
                                status: enrollment.status,
                                completedAt: enrollment.completedAt,
                            },
                        }
                    );
                }
            }
        } catch (reconcileErr) {
            console.error("Enrollment progress auto-reconcile error:", reconcileErr);
        }

        return enrollment;
    }

    /**
     * Get all enrolled courses for a user with progress data
     */
    async getMyEnrollments(userId) {
        const enrollments = await Enrollment.find({
            user: userId,
            status: { $in: ["active", "completed"] },
        })
            .sort("-enrolledAt")
            .populate({
                path: "course",
                match: { del_flag: 0 },
                populate: [
                    { path: "instructor", select: "username name avatar" },
                    { path: "thumbnail", select: "url" },
                    {
                        path: "chapters",
                        match: { del_flag: 0 },
                        options: { sort: { order: 1 } },
                        populate: {
                            path: "lessons",
                            match: { del_flag: 0 },
                            select: "_id",
                        },
                    },
                ],
            });

        // Filter out enrollments where course was deleted
        const validEnrollments = enrollments.filter((e) => e.course != null);

        return { enrollments: validEnrollments };
    }

    /**
     * Mark a lesson as completed (or toggle) and recalculate progress
     */
    async completeLesson(userId, courseId, lessonId, shouldComplete = true) {
        // Verify enrollment
        const enrollment = await Enrollment.findOne({
            user: userId,
            course: courseId,
            status: { $in: ["active", "completed"] },
        });
        if (!enrollment) throw new NotFoundException("Enrollment not found");

        // Verify lesson exists and belongs to this course
        const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 });
        if (!lesson) throw new NotFoundException("Lesson not found");

        const chapter = await Chapter.findOne({
            _id: lesson.chapter,
            course: courseId,
            del_flag: 0,
        });
        if (!chapter) throw new BadRequestException("Lesson does not belong to this course");

        const isAlreadyCompleted = enrollment.completedLessons.some(
            (id) => id.toString() === lessonId.toString()
        );

        if (!shouldComplete) {
            // Uncomplete action
            if (isAlreadyCompleted) {
                enrollment.completedLessons = enrollment.completedLessons.filter(
                    (id) => id.toString() !== lessonId.toString()
                );
            }
        } else {
            // Complete action
            if (!isAlreadyCompleted) {
                enrollment.completedLessons.push(lessonId);
                enrollment.lastLesson = lessonId;
                enrollment.lastAccessedAt = new Date();
            } else {
                // Already completed, return early
                return this._buildProgressResponse(enrollment, courseId);
            }
        }

        // Recalculate progress against actual total lessons
        const totalLessons = await this._getTotalLessons(courseId);
        if (totalLessons > 0) {
            enrollment.progress = Math.min(
                100,
                Math.round(((enrollment.completedLessons?.length || 0) / totalLessons) * 100)
            );
        } else {
            enrollment.progress = 0;
        }

        // Mark as completed if 100%
        if (enrollment.progress >= 100) {
            enrollment.status = "completed";
            if (!enrollment.completedAt) {
                enrollment.completedAt = new Date();
            }
        } else {
            enrollment.status = "active";
            enrollment.completedAt = null;
        }

        await enrollment.save();

        if (shouldComplete && !isAlreadyCompleted) {
            // Record idempotent engagement evidence for lesson objectives
            try {
                const masteryService = require("./mastery.services");
                const intelligence = await require("../models").LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
                const objectives = (intelligence?.learningObjectives?.length ? intelligence.learningObjectives : lesson.learningObjectives) || [];
                
                const targetObjectives = objectives.length > 0 ? objectives : ["Nắm vững nội dung bài học"];
                for (let i = 0; i < targetObjectives.length; i++) {
                    const obj = targetObjectives[i];
                    await masteryService.recordEvidence({
                        user: userId,
                        course: courseId,
                        lesson: lessonId,
                        objective: obj,
                        type: "lesson_completion",
                        signal: "positive",
                        strength: 1.0,
                        sourceId: lessonId,
                        idempotencyKey: `completion_${userId}_lesson_${lessonId}_obj_${i}`,
                        metadata: {
                            notes: "Hoàn thành theo dõi nội dung bài học",
                        },
                    });
                }
            } catch (evErr) {
                console.error("Engagement evidence recording failed on lesson completion:", evErr);
            }
        }

        return {
            completedLessons: enrollment.completedLessons,
            progress: enrollment.progress,
            totalLessons,
            completedCount: enrollment.completedLessons.length,
            status: enrollment.status,
        };
    }

    /**
     * Toggle completion status of a lesson
     */
    async toggleLesson(userId, courseId, lessonId) {
        const enrollment = await Enrollment.findOne({
            user: userId,
            course: courseId,
            status: { $in: ["active", "completed"] },
        });
        if (!enrollment) throw new NotFoundException("Enrollment not found");

        const isAlreadyCompleted = enrollment.completedLessons.some(
            (id) => id.toString() === lessonId.toString()
        );

        return this.completeLesson(userId, courseId, lessonId, !isAlreadyCompleted);
    }

    /**
     * Get total number of active lessons in a course
     */
    async _getTotalLessons(courseId) {
        try {
            const courseQuery = Course.findById(courseId);
            const course = typeof courseQuery?.populate === "function"
                ? await courseQuery.populate({
                    path: "chapters",
                    match: { del_flag: 0 },
                    populate: {
                        path: "lessons",
                        match: { del_flag: 0 },
                        select: "_id",
                    },
                })
                : await courseQuery;

            if (course && Array.isArray(course.chapters) && course.chapters.length > 0) {
                const total = course.chapters.reduce(
                    (sum, chapter) => sum + (chapter.lessons?.length || 0),
                    0
                );
                if (total > 0) return total;
            }
        } catch (courseErr) {
            console.warn("_getTotalLessons via course populate warning:", courseErr?.message);
        }

        try {
            if (typeof Chapter.find === "function") {
                const query = Chapter.find({ course: courseId, del_flag: 0 });
                const chapters = typeof query?.select === "function" ? await query.select("_id") : await query;
                if (Array.isArray(chapters) && chapters.length > 0) {
                    const chapterIds = chapters.map((c) => c._id);
                    if (typeof Lesson.countDocuments === "function") {
                        return await Lesson.countDocuments({
                            chapter: { $in: chapterIds },
                            del_flag: 0,
                        });
                    }
                }
            }
        } catch (directErr) {
            console.warn("_getTotalLessons direct count warning:", directErr?.message);
        }

        return 0;
    }

    /**
     * Build a standardized progress response
     */
    async _buildProgressResponse(enrollment, courseId) {
        const totalLessons = await this._getTotalLessons(courseId);
        return {
            completedLessons: enrollment.completedLessons,
            progress: enrollment.progress,
            totalLessons,
            completedCount: enrollment.completedLessons.length,
            status: enrollment.status,
        };
    }
}

module.exports = new EnrollmentService();
