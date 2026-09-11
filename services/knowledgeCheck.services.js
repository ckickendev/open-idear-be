const mongoose = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ForbiddenException, ServerException } = require("../exceptions");
const { Lesson, Chapter, Course, KnowledgeCheck, KnowledgeCheckAttempt, LessonIntelligence } = require("../models");
const { providerRegistry } = require("../ai/provider");
const { COURSE_INTELLIGENCE_PROMPTS } = require("../ai/course-intelligence/prompts");
const aiJobService = require("./aiJob.services");
const courseIntelligenceService = require("./courseIntelligence.services");

class KnowledgeCheckService extends Service {
    /**
     * Helper: Verify lesson ownership for creator actions
     */
    async verifyLessonOwnership(lessonId, userId) {
        return await courseIntelligenceService.verifyLessonOwnership(lessonId, userId);
    }

    /**
     * Generate or regenerate AI Knowledge Check (Assessment)
     */
    async generateKnowledgeCheck(lessonId, userId, { force = false, count = 4 } = {}) {
        const { lesson, course } = await this.verifyLessonOwnership(lessonId, userId);

        // Get latest LessonIntelligence or trigger analysis
        let intelligence = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
        if (!intelligence || intelligence.status !== "completed") {
            intelligence = await courseIntelligenceService.analyzeLesson(lessonId, userId, { force: false });
        }

        const sourceIntelVersion = intelligence.version || 1;
        const sourceMediaVersion = lesson.media?.version || 1;
        const capability = "course.lesson.knowledge_check";

        const inputFingerprint = aiJobService.computeFingerprint({
            lessonId: lesson._id.toString(),
            sourceMediaId: lesson.media?._id?.toString() || "none",
            sourceMediaVersion,
            capability,
            language: intelligence.transcript?.language || "vi",
            promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
        });

        // AI Job for deduplication and idempotency
        const { job, isExisting, isProcessing } = await aiJobService.createOrFindJob({
            type: "course_intelligence",
            capability,
            user: userId,
            course: course._id,
            lesson: lesson._id,
            sourceMedia: lesson.media?._id || null,
            sourceMediaVersion,
            inputFingerprint,
            model: COURSE_INTELLIGENCE_PROMPTS.model,
            promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
            forceOverwrite: force,
        });

        // If completed check exists with matching fingerprint and not forced, reuse
        if (isExisting && !isProcessing && !force) {
            const existingCheck = await KnowledgeCheck.findOne({ lesson: lessonId }).sort("-version");
            if (existingCheck && existingCheck.status !== "failed" && !existingCheck.isStale) {
                return existingCheck;
            }
        }

        const latestCheck = await KnowledgeCheck.findOne({ lesson: lessonId }).sort("-version");
        const nextVersion = latestCheck ? latestCheck.version + 1 : 1;

        const checkDoc = new KnowledgeCheck({
            _id: new mongoose.Types.ObjectId(),
            lesson: lesson._id,
            course: course._id,
            version: nextVersion,
            status: "ready",
            sourceIntelligenceVersion: sourceIntelVersion,
            sourceMediaVersion: sourceMediaVersion,
            inputFingerprint,
            createdBy: userId,
            model: COURSE_INTELLIGENCE_PROMPTS.model,
            promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
            isStale: false,
        });

        try {
            const provider = providerRegistry.getProvider();
            if (!provider) {
                throw new ServerException("AI Provider is not configured. Please check GEMINI_API_KEY.");
            }

            const prompt = COURSE_INTELLIGENCE_PROMPTS.buildKnowledgeCheckPrompt({
                title: lesson.title,
                transcriptText: intelligence.transcript?.text || lesson.content || lesson.title,
                learningObjectives: intelligence.learningObjectives || lesson.learningObjectives || [],
                keyPoints: intelligence.keyPoints || lesson.keyPoints || [],
                concepts: intelligence.concepts || lesson.concepts || [],
                count: Math.min(5, Math.max(3, count)),
            });

            const completion = await provider.completeJSON([
                { role: "user", content: prompt },
            ]);

            const quizData = completion.data || {};
            const rawQuestions = Array.isArray(quizData.questions) ? quizData.questions : [];

            if (rawQuestions.length === 0) {
                throw new Error("AI failed to generate assessment questions from lesson evidence.");
            }

            // Schema Validation, Sanitization & Normalization
            const validatedQuestions = rawQuestions.slice(0, 5).map((q, qIdx) => {
                const qId = q.id || `q_${qIdx + 1}`;
                const questionText = String(q.question || "").trim();
                const rawOptions = Array.isArray(q.options) ? q.options : [];

                const options = rawOptions.slice(0, 5).map((opt, optIdx) => ({
                    id: opt.id || `opt_${optIdx + 1}`,
                    text: String(opt.text || "").trim(),
                })).filter((opt) => opt.text.length > 0);

                if (options.length < 2) {
                    throw new Error(`Question ${qIdx + 1} does not have enough valid options.`);
                }

                const validOptionIds = options.map((o) => o.id);
                let correctOptionId = q.correctOptionId;
                if (!validOptionIds.includes(correctOptionId)) {
                    correctOptionId = validOptionIds[0];
                }

                const explanation = String(q.explanation || "Giải thích đáp án chính xác.").trim();
                const cognitiveLevel = ["remember", "understand", "apply", "analyze"].includes(q.cognitiveLevel)
                    ? q.cognitiveLevel
                    : "understand";

                return {
                    id: qId,
                    question: questionText,
                    options,
                    correctOptionId,
                    explanation,
                    objectiveReference: String(q.objectiveReference || "").trim(),
                    cognitiveLevel,
                };
            }).filter((q) => q.question.length > 0);

            if (validatedQuestions.length === 0) {
                throw new Error("No valid questions passed schema validation.");
            }

            checkDoc.questions = validatedQuestions;
            checkDoc.status = "ready";
            await checkDoc.save();

            if (job?._id) {
                await aiJobService.completeJob(job._id, {
                    refType: "knowledge_check",
                    refId: checkDoc._id,
                });
            }

            return checkDoc;
        } catch (error) {
            console.error("Knowledge Check Generation failed:", error);
            checkDoc.status = "failed";
            checkDoc.error = error.message || "Failed to generate assessment questions";
            await checkDoc.save();

            if (job?._id) {
                await aiJobService.failJob(job._id, error.message);
            }

            throw error;
        }
    }

    /**
     * Get latest KnowledgeCheck for creator review
     */
    async getKnowledgeCheck(lessonId, userId) {
        const { lesson } = await this.verifyLessonOwnership(lessonId, userId);

        const check = await KnowledgeCheck.findOne({ lesson: lessonId }).sort("-version");
        if (!check) return null;

        // Check staleness against current lesson media and intelligence
        const currentIntel = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
        const currentMediaVersion = lesson.media?.version || 1;
        const currentIntelVersion = currentIntel?.version || 1;

        check.isStale = (check.sourceMediaVersion !== currentMediaVersion) || (check.sourceIntelligenceVersion !== currentIntelVersion);
        return check;
    }

    /**
     * Creator edits questions in draft KnowledgeCheck
     */
    async updateKnowledgeCheck(lessonId, checkId, userId, updateData) {
        await this.verifyLessonOwnership(lessonId, userId);

        const check = await KnowledgeCheck.findOne({ _id: checkId, lesson: lessonId });
        if (!check) throw new NotFoundException("Knowledge check not found");

        if (Array.isArray(updateData.questions)) {
            check.questions = updateData.questions;
        }

        await check.save();
        return check;
    }

    /**
     * Creator approves KnowledgeCheck for learners
     */
    async acceptKnowledgeCheck(lessonId, checkId, userId) {
        const { lesson } = await this.verifyLessonOwnership(lessonId, userId);

        const check = await KnowledgeCheck.findOne({ _id: checkId, lesson: lessonId });
        if (!check) throw new NotFoundException("Knowledge check not found");

        if (check.status === "failed") {
            throw new BadRequestException("Cannot accept a failed knowledge check");
        }

        // Verify Staleness
        const currentIntel = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
        const currentMediaVersion = lesson.media?.version || 1;
        const currentIntelVersion = currentIntel?.version || 1;

        if (check.sourceMediaVersion !== currentMediaVersion || check.sourceIntelligenceVersion !== currentIntelVersion) {
            throw new BadRequestException("Cannot accept stale knowledge check. Please regenerate for current lesson version.");
        }

        check.status = "accepted";
        check.acceptedAt = new Date();
        check.acceptedBy = userId;
        await check.save();

        return check;
    }

    /**
     * Learner endpoint: Get accepted quiz with answer keys stripped
     */
    async getLearnerKnowledgeCheck(lessonId) {
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            throw new BadRequestException("Invalid lesson ID");
        }

        const check = await KnowledgeCheck.findOne({
            lesson: lessonId,
            status: "accepted",
        }).sort("-version");

        if (!check || check.questions.length === 0) {
            return null;
        }

        // Strip correctOptionId, explanation, and internal AI telemetry
        const sanitizedQuestions = check.questions.map((q) => ({
            id: q.id,
            question: q.question,
            options: q.options.map((o) => ({ id: o.id, text: o.text })),
            objectiveReference: q.objectiveReference,
            cognitiveLevel: q.cognitiveLevel,
        }));

        return {
            _id: check._id,
            lesson: check.lesson,
            version: check.version,
            totalQuestions: sanitizedQuestions.length,
            questions: sanitizedQuestions,
        };
    }

    /**
     * Learner endpoint: Submit quiz attempt, calculate score server-side
     */
    async submitAttempt(lessonId, userId, submittedAnswers) {
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            throw new BadRequestException("Invalid lesson ID");
        }

        const check = await KnowledgeCheck.findOne({
            lesson: lessonId,
            status: "accepted",
        }).sort("-version");

        if (!check || check.questions.length === 0) {
            throw new NotFoundException("No active knowledge check found for this lesson");
        }

        const answerMap = new Map();
        if (Array.isArray(submittedAnswers)) {
            submittedAnswers.forEach((ans) => {
                if (ans.questionId) {
                    answerMap.set(String(ans.questionId), String(ans.selectedOptionId || ""));
                }
            });
        }

        let correctCount = 0;
        const results = [];
        const attemptAnswers = [];

        check.questions.forEach((q) => {
            const selectedOptionId = answerMap.get(q.id) || "";
            const isCorrect = selectedOptionId === q.correctOptionId;

            if (isCorrect) correctCount++;

            attemptAnswers.push({
                questionId: q.id,
                selectedOptionId,
                isCorrect,
            });

            results.push({
                questionId: q.id,
                selectedOptionId,
                correctOptionId: q.correctOptionId,
                isCorrect,
                explanation: q.explanation,
            });
        });

        const totalQuestions = check.questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const passed = score >= 70;

        const attempt = new KnowledgeCheckAttempt({
            _id: new mongoose.Types.ObjectId(),
            user: userId,
            course: check.course,
            lesson: check.lesson,
            knowledgeCheck: check._id,
            knowledgeCheckVersion: check.version,
            answers: attemptAnswers,
            score,
            totalQuestions,
            correctCount,
            passed,
            completedAt: new Date(),
        });

        await attempt.save();

        // Record LearningEvidence for each question mapped to an objective
        try {
            const masteryService = require("./mastery.services");
            for (const q of check.questions) {
                const selectedOptionId = answerMap.get(q.id) || "";
                const isCorrect = selectedOptionId === q.correctOptionId;
                const objective = q.objectiveReference || "Nắm vững nội dung bài học";

                await masteryService.recordEvidence({
                    user: userId,
                    course: check.course,
                    lesson: check.lesson,
                    objective,
                    type: "knowledge_check",
                    signal: isCorrect ? "positive" : "negative",
                    strength: 1.0,
                    sourceId: attempt._id,
                    idempotencyKey: `attempt_${attempt._id}_q_${q.id}`,
                    metadata: {
                        questionId: q.id,
                        attemptId: attempt._id,
                        score,
                    },
                });
            }
        } catch (mErr) {
            console.error("Mastery evidence recording failed:", mErr);
        }

        return {
            attemptId: attempt._id,
            score,
            totalQuestions,
            correctCount,
            passed,
            results,
        };
    }

    /**
     * Get past attempts for a user on a lesson
     */
    async getLearnerAttempts(lessonId, userId) {
        return await KnowledgeCheckAttempt.find({
            lesson: lessonId,
            user: userId,
        }).sort("-createdAt").limit(10);
    }
}

module.exports = new KnowledgeCheckService();
