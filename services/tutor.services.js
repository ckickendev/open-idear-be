const mongoose = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ForbiddenException, ServerException } = require("../exceptions");
const {
    Lesson,
    Chapter,
    Course,
    Enrollment,
    LessonIntelligence,
    KnowledgeCheckAttempt,
    TutorSession,
    TutorMessage,
} = require("../models");
const { providerRegistry } = require("../ai/provider");
const { COURSE_INTELLIGENCE_PROMPTS } = require("../ai/course-intelligence/prompts");

class TutorService extends Service {
    /**
     * Helper: Verify that the learner has valid access to the lesson
     */
    async verifyLearnerLessonAccess(userId, lessonId) {
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            throw new BadRequestException("Invalid lesson ID");
        }

        const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 });
        if (!lesson) throw new NotFoundException("Lesson not found");

        const chapter = await Chapter.findOne({ _id: lesson.chapter, del_flag: 0 });
        if (!chapter) throw new NotFoundException("Chapter not found");

        const course = await Course.findOne({ _id: chapter.course, del_flag: 0 });
        if (!course) throw new NotFoundException("Course not found");

        // Instructor has full access
        if (course.instructor.toString() === userId.toString()) {
            return { lesson, chapter, course, isInstructor: true };
        }

        // Free preview lesson
        if (lesson.isFreePreview && course.status === "published") {
            return { lesson, chapter, course, isFreePreview: true };
        }

        // Check active enrollment
        const enrollment = await Enrollment.findOne({
            user: userId,
            course: course._id,
            status: "active",
        });

        if (!enrollment) {
            throw new ForbiddenException("Vui lòng đăng ký khóa học để tương tác với Trợ lý Học tập AI");
        }

        return { lesson, chapter, course, enrollment };
    }

    /**
     * Get or initialize a learner Tutor Session for a lesson
     */
    async getOrCreateSession(userId, lessonId) {
        const { lesson, course } = await this.verifyLearnerLessonAccess(userId, lessonId);

        let session = await TutorSession.findOne({
            user: userId,
            lesson: lesson._id,
            status: "active",
        }).sort("-updatedAt");

        if (!session) {
            session = new TutorSession({
                _id: new mongoose.Types.ObjectId(),
                user: userId,
                course: course._id,
                lesson: lesson._id,
                status: "active",
                messageCount: 0,
                lastActivityAt: new Date(),
            });
            await session.save();
        }

        return session;
    }

    /**
     * Get message history for a session
     */
    async getSessionMessages(sessionId, userId, limit = 30) {
        const session = await TutorSession.findOne({ _id: sessionId, user: userId });
        if (!session) throw new NotFoundException("Tutor session not found");

        return await TutorMessage.find({ session: sessionId })
            .sort("createdAt")
            .limit(limit);
    }

    /**
     * Bounded Context Builder for Grounded Tutor
     */
    async buildTutorContext(lesson, chapter, course, userId, timestampSeconds) {
        // 1. Approved Lesson Intelligence
        const intelligence = await LessonIntelligence.findOne({ lesson: lesson._id }).sort("-version");

        // Check staleness
        const isStale =
            intelligence &&
            (intelligence.sourceMediaVersion !== (lesson.media?.version || 1) ||
                intelligence.status !== "completed");

        let summary = { short: lesson.description || "", detailed: lesson.summary || "" };
        let objectives = lesson.learningObjectives || [];
        let keyPoints = lesson.keyPoints || [];
        let concepts = lesson.concepts || [];
        let transcriptExcerpt = "";

        if (intelligence && !isStale) {
            summary = intelligence.summary || summary;
            objectives = intelligence.learningObjectives?.length ? intelligence.learningObjectives : objectives;
            keyPoints = intelligence.keyPoints?.length ? intelligence.keyPoints : keyPoints;
            concepts = intelligence.concepts?.length ? intelligence.concepts : concepts;

            // Bounded transcript segment retrieval
            const segments = intelligence.transcript?.segments || [];
            if (segments.length > 0) {
                if (typeof timestampSeconds === "number" && timestampSeconds >= 0) {
                    // Prioritize window of ±90 seconds around the timestamp
                    const minTime = Math.max(0, timestampSeconds - 90);
                    const maxTime = timestampSeconds + 90;
                    const focused = segments.filter((s) => s.end >= minTime && s.start <= maxTime);
                    transcriptExcerpt = focused.map((s) => `[${Math.floor(s.start / 60)}:${(Math.floor(s.start % 60)).toString().padStart(2, "0")}] ${s.text}`).join("\n");
                }

                // If no timestamp or excerpt is empty, provide a bounded overview excerpt
                if (!transcriptExcerpt) {
                    transcriptExcerpt = segments.slice(0, 30).map((s) => `[${Math.floor(s.start / 60)}:${(Math.floor(s.start % 60)).toString().padStart(2, "0")}] ${s.text}`).join("\n");
                }
            }
        }

        // 2. Knowledge Check Attempt & Mastery Context
        let knowledgeCheckContext = "";
        const lastAttempt = await KnowledgeCheckAttempt.findOne({
            lesson: lesson._id,
            user: userId,
        }).sort("-createdAt");

        if (lastAttempt) {
            const incorrectCount = lastAttempt.totalQuestions - lastAttempt.correctCount;
            knowledgeCheckContext = `Người học đã làm bài kiểm tra gần nhất với kết quả: ${lastAttempt.score}% (${lastAttempt.correctCount}/${lastAttempt.totalQuestions} câu đúng). ${incorrectCount > 0 ? `Có ${incorrectCount} câu trả lời chưa chính xác.` : "Đạt điểm tuyệt đối."}`;
        }

        const ObjectiveMastery = require("../models").ObjectiveMastery;
        const masteryRecords = await ObjectiveMastery.find({ user: userId, lesson: lesson._id });
        if (masteryRecords.length > 0) {
            const masterySummary = masteryRecords.map((m) => `[${m.objective}: ${m.level}]`).join(", ");
            knowledgeCheckContext += ` | Năng lực hiện tại của người học: ${masterySummary}`;
        }

        return {
            courseTitle: course.title,
            chapterTitle: chapter.title,
            lessonTitle: lesson.title,
            lessonDescription: lesson.description,
            summary,
            learningObjectives: objectives,
            keyPoints,
            concepts,
            transcriptExcerpt: transcriptExcerpt.slice(0, 4000), // bounded context limit
            knowledgeCheckContext,
        };
    }

    /**
     * Send message to AI Learning Companion
     */
    async sendMessage({ userId, lessonId, sessionId, message, timestampSeconds }) {
        if (!message || typeof message !== "string" || !message.trim()) {
            throw new BadRequestException("Message content is required");
        }

        const sanitizedUserMessage = message.trim().slice(0, 1000); // 1000 char limit

        const { lesson, chapter, course } = await this.verifyLearnerLessonAccess(userId, lessonId);

        let session;
        if (sessionId) {
            session = await TutorSession.findOne({ _id: sessionId, user: userId });
        }
        if (!session) {
            session = await this.getOrCreateSession(userId, lessonId);
        }

        // Save learner message
        const userMsg = new TutorMessage({
            _id: new mongoose.Types.ObjectId(),
            session: session._id,
            user: userId,
            lesson: lesson._id,
            role: "user",
            content: sanitizedUserMessage,
        });
        await userMsg.save();

        // Retrieve last 6 messages for bounded conversation history
        const recentMessages = await TutorMessage.find({ session: session._id })
            .sort("-createdAt")
            .limit(6);
        const conversationHistory = recentMessages.reverse().map((m) => ({
            role: m.role,
            content: m.content,
        }));

        // Build bounded learning context
        const tutorContext = await this.buildTutorContext(
            lesson,
            chapter,
            course,
            userId,
            typeof timestampSeconds === "number" ? timestampSeconds : undefined
        );

        try {
            const provider = providerRegistry.getProvider();
            if (!provider) {
                throw new ServerException("AI Provider is not configured. Please check GEMINI_API_KEY.");
            }

            const prompt = COURSE_INTELLIGENCE_PROMPTS.buildTutorPrompt({
                ...tutorContext,
                userMessage: sanitizedUserMessage,
                timestampSeconds: typeof timestampSeconds === "number" ? timestampSeconds : undefined,
                conversationHistory,
            });

            const completion = await provider.completeJSON([
                { role: "user", content: prompt },
            ]);

            const responseData = completion.data || {};

            // Validate and sanitize structured output
            const answer = String(responseData.answer || "Tôi có thể hỗ trợ bạn giải thích các kiến thức trong bài học này.").trim().slice(0, 4000);
            const grounded = typeof responseData.grounded === "boolean" ? responseData.grounded : true;
            const confidence = ["high", "medium", "low"].includes(responseData.confidence) ? responseData.confidence : "high";

            const rawReferences = Array.isArray(responseData.references) ? responseData.references : [];
            const sanitizedReferences = rawReferences.slice(0, 4).map((ref) => ({
                type: ["transcript", "objective", "concept", "summary", "knowledge_check"].includes(ref.type)
                    ? ref.type
                    : "concept",
                timestampSeconds: typeof ref.timestampSeconds === "number" ? Math.max(0, ref.timestampSeconds) : null,
                label: String(ref.label || "Nguồn bài học").trim().slice(0, 100),
            }));

            const rawFollowUps = Array.isArray(responseData.suggestedFollowUps) ? responseData.suggestedFollowUps : [];
            const suggestedFollowUps = rawFollowUps.slice(0, 3).map((f) => String(f).trim().slice(0, 120)).filter(Boolean);

            // Save assistant message
            const assistantMsg = new TutorMessage({
                _id: new mongoose.Types.ObjectId(),
                session: session._id,
                user: userId,
                lesson: lesson._id,
                role: "assistant",
                content: answer,
                grounded,
                confidence,
                references: sanitizedReferences,
                suggestedFollowUps,
                model: COURSE_INTELLIGENCE_PROMPTS.model,
                promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
            });
            await assistantMsg.save();

            // Record lightweight interaction evidence for primary objective
            try {
                const masteryService = require("./mastery.services");
                const primaryObjective = (tutorContext.learningObjectives && tutorContext.learningObjectives[0]) || "Nắm vững nội dung bài học";
                await masteryService.recordEvidence({
                    user: userId,
                    course: course._id,
                    lesson: lesson._id,
                    objective: primaryObjective,
                    type: "tutor_interaction",
                    signal: "positive",
                    strength: 0.5,
                    sourceId: assistantMsg._id,
                    idempotencyKey: `tutor_${assistantMsg._id}`,
                    metadata: {
                        tutorMessageId: assistantMsg._id,
                        notes: "Trao đổi củng cố kiến thức cùng Trợ lý AI",
                    },
                });
            } catch (evErr) {
                console.error("Tutor interaction evidence recording failed:", evErr);
            }

            // Update session stats
            session.messageCount = (session.messageCount || 0) + 2;
            session.lastActivityAt = new Date();
            await session.save();

            return {
                userMessage: userMsg,
                assistantMessage: assistantMsg,
                session,
            };
        } catch (error) {
            console.error("Tutor Execution failed:", error);

            // Graceful fallback message
            const fallbackMsg = new TutorMessage({
                _id: new mongoose.Types.ObjectId(),
                session: session._id,
                user: userId,
                lesson: lesson._id,
                role: "assistant",
                content: "Hiện tại tôi đang gặp khó khăn khi kết nối với học liệu bài giảng. Bạn vui lòng thử lại sau giây lát nhé!",
                grounded: false,
                confidence: "low",
                references: [],
                suggestedFollowUps: [],
            });
            await fallbackMsg.save();

            return {
                userMessage: userMsg,
                assistantMessage: fallbackMsg,
                session,
            };
        }
    }
}

module.exports = new TutorService();
