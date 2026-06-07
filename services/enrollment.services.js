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
     * Mark a lesson as completed and recalculate progress
     */
    async completeLesson(userId, courseId, lessonId) {
        // Verify enrollment
        const enrollment = await Enrollment.findOne({
            user: userId,
            course: courseId,
            status: "active",
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

        // Check if already completed
        if (enrollment.completedLessons.some(
            (id) => id.toString() === lessonId.toString()
        )) {
            // Already completed — still return current state
            return this._buildProgressResponse(enrollment, courseId);
        }

        // Add to completedLessons
        enrollment.completedLessons.push(lessonId);
        enrollment.lastAccessedAt = new Date();

        // Recalculate progress
        const totalLessons = await this._getTotalLessons(courseId);
        if (totalLessons > 0) {
            enrollment.progress = Math.round(
                (enrollment.completedLessons.length / totalLessons) * 100
            );
        }

        // Mark as completed if 100%
        if (enrollment.progress >= 100) {
            enrollment.status = "completed";
        }

        await enrollment.save();

        return {
            completedLessons: enrollment.completedLessons,
            progress: enrollment.progress,
            totalLessons,
            completedCount: enrollment.completedLessons.length,
            status: enrollment.status,
        };
    }

    /**
     * Get total number of active lessons in a course
     */
    async _getTotalLessons(courseId) {
        const course = await Course.findById(courseId)
            .populate({
                path: "chapters",
                match: { del_flag: 0 },
                populate: {
                    path: "lessons",
                    match: { del_flag: 0 },
                    select: "_id",
                },
            });

        if (!course) return 0;
        return course.chapters.reduce(
            (total, chapter) => total + (chapter.lessons?.length || 0),
            0
        );
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
