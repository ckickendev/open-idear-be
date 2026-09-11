const mongoose = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ForbiddenException } = require("../exceptions");
const {
    Lesson,
    Chapter,
    Course,
    Enrollment,
    LessonIntelligence,
    LearningEvidence,
    ObjectiveMastery,
} = require("../models");

class MasteryService extends Service {
    /**
     * Compute mastery level from numeric score (0 - 100) and distinct comprehension signals
     */
    computeLevel(score, positiveComprehensionCount = 0) {
        if (score >= 90 && positiveComprehensionCount >= 2) return "mastered";
        if (score >= 75 && positiveComprehensionCount >= 1) return "proficient";
        if (score >= 50) return "developing";
        if (score >= 20) return "introduced";
        return "unknown";
    }

    /**
     * Record a new learning evidence signal with idempotency protection and recalculate objective mastery
     */
    async recordEvidence({
        user,
        course,
        lesson,
        objective,
        type,
        signal,
        strength = 1.0,
        sourceId = null,
        idempotencyKey = null,
        metadata = {},
    }) {
        if (!user || !lesson || !objective) {
            throw new BadRequestException("User, lesson, and objective are required for evidence");
        }

        const normalizedObjective = String(objective).trim();

        // Idempotency check
        if (idempotencyKey) {
            const existing = await LearningEvidence.findOne({ idempotencyKey });
            if (existing) {
                const existingMastery = await ObjectiveMastery.findOne({
                    user,
                    lesson,
                    objective: normalizedObjective,
                });
                return { evidence: existing, mastery: existingMastery };
            }
        }

        // Determine evidence category
        let category = "comprehension";
        if (type === "lesson_completion" || type === "video_progress") {
            category = "engagement";
        } else if (type === "tutor_interaction") {
            category = "interaction";
        }

        const evidence = new LearningEvidence({
            _id: new mongoose.Types.ObjectId(),
            user,
            course,
            lesson,
            objective: normalizedObjective,
            type,
            category,
            signal,
            strength: Math.max(0.1, Math.min(1.0, Number(strength) || 1.0)),
            sourceId,
            idempotencyKey: idempotencyKey || null,
            metadata,
        });

        await evidence.save();

        // Recalculate and update ObjectiveMastery state
        const mastery = await this.recalculateObjectiveMastery(user, course, lesson, normalizedObjective);

        return { evidence, mastery };
    }

    /**
     * Deterministic, explainable recalculation of an objective mastery state
     */
    async recalculateObjectiveMastery(userId, courseId, lessonId, objectiveText) {
        const objective = String(objectiveText).trim();

        // Fetch all historical evidences for this objective
        const evidences = await LearningEvidence.find({
            user: userId,
            lesson: lessonId,
            objective,
        }).sort("createdAt");

        let positiveCount = 0;
        let negativeCount = 0;
        let positiveComprehensionCount = 0;
        let correctAttempts = 0;
        let incorrectAttempts = 0;
        let hasLessonCompletion = false;
        let tutorInteractionCount = 0;
        const explanations = [];

        let engagementScore = 0;
        let comprehensionScore = 0;
        let interactionScore = 0;

        for (const ev of evidences) {
            if (ev.signal === "positive") {
                positiveCount++;
            } else if (ev.signal === "negative") {
                negativeCount++;
            }

            if (ev.category === "engagement" || ev.type === "lesson_completion" || ev.type === "video_progress") {
                hasLessonCompletion = true;
                engagementScore = Math.min(20, engagementScore + 20 * ev.strength);
            } else if (ev.category === "comprehension" || ev.type === "knowledge_check" || ev.type === "re_attempt") {
                if (ev.signal === "positive") {
                    correctAttempts++;
                    positiveComprehensionCount++;
                    comprehensionScore += 35 * ev.strength;
                } else {
                    incorrectAttempts++;
                    comprehensionScore = Math.max(0, comprehensionScore - 25 * ev.strength);
                }
            } else if (ev.category === "interaction" || ev.type === "tutor_interaction") {
                tutorInteractionCount++;
                if (ev.signal === "positive") {
                    interactionScore = Math.min(15, interactionScore + 10 * ev.strength);
                }
            }
        }

        // Combined score: engagement baseline (max 20) + comprehension + interaction (max 15)
        const computedScore = Math.min(100, Math.max(0, Math.round(engagementScore + comprehensionScore + interactionScore)));
        const level = this.computeLevel(computedScore, positiveComprehensionCount);

        // Build human-readable explainability bullets
        if (hasLessonCompletion) {
            explanations.push("✓ Đã hoàn thành theo dõi nội dung bài học.");
        }
        if (correctAttempts > 0) {
            explanations.push(`✓ Trả lời chính xác ${correctAttempts} câu hỏi kiểm tra kiến thức liên quan.`);
        }
        if (incorrectAttempts > 0) {
            explanations.push(`✗ Từng gặp khó khăn ở ${incorrectAttempts} câu hỏi kiểm tra trước đó.`);
        }
        if (tutorInteractionCount > 0) {
            explanations.push(`✓ Đã thảo luận và củng cố khái niệm cùng Trợ lý AI (${tutorInteractionCount} lần).`);
        }
        if (explanations.length === 0) {
            explanations.push("Chưa có bằng chứng học tập được ghi nhận cho mục tiêu này.");
        }

        // Upsert ObjectiveMastery record
        const mastery = await ObjectiveMastery.findOneAndUpdate(
            { user: userId, lesson: lessonId, objective },
            {
                $set: {
                    course: courseId,
                    score: computedScore,
                    level,
                    evidenceCount: evidences.length,
                    positiveEvidenceCount: positiveCount,
                    negativeEvidenceCount: negativeCount,
                    correctAttempts,
                    incorrectAttempts,
                    explanation: explanations,
                    lastEvidenceAt: new Date(),
                },
                $setOnInsert: {
                    _id: new mongoose.Types.ObjectId(),
                },
            },
            { upsert: true, new: true }
        );

        return mastery;
    }

    /**
     * Get aggregated lesson mastery for a learner
     */
    async getLessonMastery(userId, lessonId) {
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            throw new BadRequestException("Invalid lesson ID");
        }

        const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 });
        if (!lesson) throw new NotFoundException("Lesson not found");

        const chapter = await Chapter.findOne({ _id: lesson.chapter, del_flag: 0 });
        const course = await Course.findOne({ _id: chapter?.course, del_flag: 0 });

        // Retrieve approved learning objectives
        const intelligence = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
        const objectives = (intelligence?.learningObjectives?.length ? intelligence.learningObjectives : lesson.learningObjectives) || [];

        // Fetch existing mastery records for this lesson
        const masteryRecords = await ObjectiveMastery.find({
            user: userId,
            lesson: lessonId,
        });

        const masteryMap = new Map();
        masteryRecords.forEach((m) => masteryMap.set(m.objective, m));

        let totalScore = 0;
        const objectiveDetails = objectives.map((obj) => {
            const existing = masteryMap.get(obj);
            if (existing) {
                totalScore += existing.score;
                return existing;
            }
            // Default unrecorded objective
            return {
                user: userId,
                lesson: lessonId,
                course: course?._id,
                objective: obj,
                score: 0,
                level: "unknown",
                evidenceCount: 0,
                positiveEvidenceCount: 0,
                negativeEvidenceCount: 0,
                explanation: ["Chưa có bằng chứng học tập."],
                lastEvidenceAt: null,
            };
        });

        const count = objectives.length || 1;
        const overallScore = Math.round(totalScore / count);
        const overallLevel = this.computeLevel(overallScore, masteryRecords.filter((m) => m.positiveEvidenceCount > 0).length);

        return {
            lessonId,
            lessonTitle: lesson.title,
            overallScore,
            overallLevel,
            totalObjectives: objectives.length,
            objectives: objectiveDetails,
        };
    }

    /**
     * Get aggregated course mastery for a learner
     */
    async getCourseMastery(userId, courseId) {
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            throw new BadRequestException("Invalid course ID");
        }

        const course = await Course.findOne({ _id: courseId, del_flag: 0 });
        if (!course) throw new NotFoundException("Course not found");

        const chapters = await Chapter.find({ course: courseId, del_flag: 0 }).sort("order");
        const chapterIds = chapters.map((c) => c._id);
        const lessons = await Lesson.find({ chapter: { $in: chapterIds }, del_flag: 0 }).sort("order");

        const lessonMasteryList = [];
        let totalCourseScore = 0;
        let totalObjectivesCount = 0;
        let masteredCount = 0;
        let proficientCount = 0;
        let developingCount = 0;
        let introducedCount = 0;

        for (const lesson of lessons) {
            const lMastery = await this.getLessonMastery(userId, lesson._id);
            lessonMasteryList.push(lMastery);

            totalCourseScore += lMastery.overallScore * (lMastery.totalObjectives || 1);
            totalObjectivesCount += lMastery.totalObjectives;

            lMastery.objectives.forEach((obj) => {
                if (obj.level === "mastered") masteredCount++;
                else if (obj.level === "proficient") proficientCount++;
                else if (obj.level === "developing") developingCount++;
                else if (obj.level === "introduced") introducedCount++;
            });
        }

        const courseScore = totalObjectivesCount > 0 ? Math.round(totalCourseScore / totalObjectivesCount) : 0;
        const courseLevel = this.computeLevel(courseScore, masteredCount + proficientCount);

        return {
            courseId,
            courseTitle: course.title,
            courseScore,
            courseLevel,
            totalObjectives: totalObjectivesCount,
            masteredCount,
            proficientCount,
            developingCount,
            introducedCount,
            lessons: lessonMasteryList,
        };
    }

    /**
     * Get recent learning evidence timeline for a lesson
     */
    async getRecentEvidence(userId, lessonId, limit = 20) {
        return await LearningEvidence.find({
            user: userId,
            lesson: lessonId,
        })
            .sort("-createdAt")
            .limit(limit);
    }
}

module.exports = new MasteryService();
