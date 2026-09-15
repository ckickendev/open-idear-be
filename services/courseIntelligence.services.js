const mongoose = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ForbiddenException, ServerException } = require("../exceptions");
const { Lesson, Chapter, Course, Media, LessonIntelligence } = require("../models");
const { providerRegistry } = require("../ai/provider");
const { transcriptProvider } = require("../ai/course-intelligence/transcript.provider");
const { COURSE_INTELLIGENCE_PROMPTS } = require("../ai/course-intelligence/prompts");
const aiJobService = require("./aiJob.services");

class CourseIntelligenceService extends Service {
    /**
     * Helper: Verify lesson ownership via Chapter -> Course
     * Guarantees strict authentication and ownership boundaries.
     */
    async verifyLessonOwnership(lessonId, userId) {
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            throw new BadRequestException("Invalid lesson ID format");
        }

        const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 }).populate("media");
        if (!lesson) throw new NotFoundException("Lesson not found or has been deleted");

        const chapter = await Chapter.findOne({ _id: lesson.chapter, del_flag: 0 });
        if (!chapter) throw new NotFoundException("Section not found or has been deleted");

        const course = await Course.findOne({ _id: chapter.course, del_flag: 0 });
        if (!course) throw new NotFoundException("Course not found or has been deleted");

        if (course.instructor.toString() !== userId.toString()) {
            throw new ForbiddenException("You do not have permission to access or modify this lesson");
        }

        return { lesson, chapter, course };
    }

    /**
     * Generate or regenerate AI Course Intelligence with Job Idempotency & Provenance
     */
    async analyzeLesson(lessonId, userId, { force = false, language = "vi" } = {}) {
        const { lesson, course } = await this.verifyLessonOwnership(lessonId, userId);

        const currentMedia = lesson.media;
        const currentMediaId = currentMedia?._id?.toString() || null;
        const currentMediaVersion = currentMedia?.version || 1;
        const capability = "course.lesson.analyze";

        // Compute deterministic input fingerprint for deduplication
        const inputFingerprint = aiJobService.computeFingerprint({
            lessonId: lesson._id.toString(),
            sourceMediaId: currentMediaId,
            sourceMediaVersion: currentMediaVersion,
            capability,
            language,
            promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
        });

        // Check active / existing AI Job for cost protection & idempotency
        const { job, isExisting, isProcessing } = await aiJobService.createOrFindJob({
            type: "course_intelligence",
            capability,
            user: userId,
            course: course._id,
            lesson: lesson._id,
            sourceMedia: currentMedia?._id || null,
            sourceMediaVersion: currentMediaVersion,
            inputFingerprint,
            model: COURSE_INTELLIGENCE_PROMPTS.model,
            promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
            forceOverwrite: force,
        });

        // If a completed analysis already exists with matching fingerprint and not force, reuse it
        if (isExisting && !isProcessing && !force) {
            const existingAnalysis = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
            if (existingAnalysis && existingAnalysis.status === "completed" && !existingAnalysis.isStale) {
                return existingAnalysis;
            }
        }

        const latestIntelligence = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
        const nextVersion = latestIntelligence ? latestIntelligence.version + 1 : 1;

        // Initialize LessonIntelligence document
        const intelligence = new LessonIntelligence({
            _id: new mongoose.Types.ObjectId(),
            lesson: lesson._id,
            course: course._id,
            sourceMedia: currentMedia?._id || null,
            sourceMediaVersion: currentMediaVersion,
            sourceMediaFingerprint: currentMediaId ? `${currentMediaId}_v${currentMediaVersion}` : "no_media",
            inputFingerprint,
            version: nextVersion,
            status: "processing",
            model: COURSE_INTELLIGENCE_PROMPTS.model,
            promptVersion: COURSE_INTELLIGENCE_PROMPTS.version,
            isStale: false,
            capabilityStatuses: {
                transcript: "processing",
                summary: "processing",
                keyPoints: "processing",
                learningObjectives: "processing",
                concepts: "processing",
                keywords: "processing",
                videoChapters: "processing",
            },
        });

        await intelligence.save();

        try {
            // Step 1: Ingest Transcript
            let transcriptResult;
            if (currentMedia) {
                transcriptResult = await transcriptProvider.transcribe({
                    mediaId: currentMedia._id?.toString(),
                    cloudflareId: currentMedia.cloudflareId,
                    url: currentMedia.url,
                    title: lesson.title,
                    duration: currentMedia.duration || 0,
                    description: lesson.description || "",
                });
            } else {
                transcriptResult = {
                    status: "ready",
                    language: language || "vi",
                    text: lesson.content || lesson.title,
                    segments: [
                        { start: 0, end: 30, text: lesson.title },
                    ],
                    provider: "text_content",
                    duration: 30,
                };
            }

            // Normalize and sort transcript segments chronologically
            const rawSegments = Array.isArray(transcriptResult.segments) ? transcriptResult.segments : [];
            const sanitizedSegments = rawSegments
                .filter((s) => Number(s.start) >= 0 && Number(s.end) > Number(s.start) && s.text?.trim())
                .sort((a, b) => Number(a.start) - Number(b.start))
                .map((s) => ({
                    start: Math.round(Number(s.start) * 10) / 10,
                    end: Math.round(Number(s.end) * 10) / 10,
                    text: String(s.text).trim(),
                }));

            intelligence.transcript = {
                status: transcriptResult.status,
                language: transcriptResult.language,
                text: transcriptResult.text,
                segments: sanitizedSegments,
                provider: transcriptResult.provider,
                generatedAt: new Date(),
            };
            intelligence.capabilityStatuses.transcript = transcriptResult.status === "ready" ? "completed" : "failed";

            // Step 2: Multi-Capability LLM Analysis via Provider Registry
            const provider = providerRegistry.getProvider();
            if (!provider) {
                throw new ServerException("AI Provider is not configured. Please check GEMINI_API_KEY.");
            }

            const prompt = COURSE_INTELLIGENCE_PROMPTS.buildAnalysisPrompt({
                title: lesson.title,
                description: lesson.description,
                transcriptText: transcriptResult.text,
                language,
            });

            const completion = await provider.completeJSON([
                { role: "user", content: prompt },
            ]);

            const analysisData = completion.data || {};

            // Step 3: Schema Validation, Normalization & Sanitization
            // A. Summary
            const shortSummary = String(analysisData.summary?.short || `Bài học về ${lesson.title}`).trim().slice(0, 500);
            const detailedSummary = String(analysisData.summary?.detailed || analysisData.summary?.short || lesson.description || "").trim().slice(0, 3000);
            intelligence.summary = { short: shortSummary, detailed: detailedSummary };
            intelligence.capabilityStatuses.summary = shortSummary ? "completed" : "failed";

            // B. Key Points (Deduplicate & sanitize)
            const rawKeyPoints = Array.isArray(analysisData.keyPoints) ? analysisData.keyPoints : [];
            intelligence.keyPoints = Array.from(
                new Set(rawKeyPoints.map((p) => String(p).trim()).filter(Boolean))
            ).slice(0, 10);
            intelligence.capabilityStatuses.keyPoints = intelligence.keyPoints.length > 0 ? "completed" : "failed";

            // C. Learning Objectives (Deduplicate & sanitize)
            const rawObjectives = Array.isArray(analysisData.learningObjectives) ? analysisData.learningObjectives : [];
            intelligence.learningObjectives = Array.from(
                new Set(rawObjectives.map((o) => String(o).trim()).filter(Boolean))
            ).slice(0, 8);
            intelligence.capabilityStatuses.learningObjectives = intelligence.learningObjectives.length > 0 ? "completed" : "failed";

            // D. Concepts (Deduplicate & lowercase comparison)
            const rawConcepts = Array.isArray(analysisData.concepts) ? analysisData.concepts : [];
            intelligence.concepts = Array.from(
                new Set(rawConcepts.map((c) => String(c).trim()).filter(Boolean))
            ).slice(0, 12);
            intelligence.capabilityStatuses.concepts = intelligence.concepts.length > 0 ? "completed" : "failed";

            // E. Keywords (Deduplicate)
            const rawKeywords = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
            intelligence.keywords = Array.from(
                new Set(rawKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean))
            ).slice(0, 15);
            intelligence.capabilityStatuses.keywords = intelligence.keywords.length > 0 ? "completed" : "failed";

            // F. Video Chapter Markers (Chronological sort)
            const rawChapters = Array.isArray(analysisData.suggestedVideoChapters || analysisData.suggestedChapters)
                ? (analysisData.suggestedVideoChapters || analysisData.suggestedChapters)
                : [];
            const sanitizedChapters = rawChapters
                .filter((ch) => ch && ch.title)
                .map((ch) => ({
                    timestamp: String(ch.timestamp || "00:00").trim(),
                    seconds: Math.max(0, Number(ch.seconds || 0)),
                    title: String(ch.title).trim().slice(0, 120),
                    summary: String(ch.summary || "").trim().slice(0, 300),
                }))
                .sort((a, b) => a.seconds - b.seconds);

            intelligence.suggestedVideoChapters = sanitizedChapters;
            intelligence.suggestedChapters = sanitizedChapters; // Backward compatibility
            intelligence.capabilityStatuses.videoChapters = sanitizedChapters.length > 0 ? "completed" : "failed";

            intelligence.status = "completed";
            intelligence.generatedAt = new Date();
            await intelligence.save();

            // Mark AI Job completed
            if (job?._id) {
                await aiJobService.completeJob(job._id, {
                    refType: "lesson_intelligence",
                    refId: intelligence._id,
                });
            }

            return intelligence;
        } catch (error) {
            console.error("Course Intelligence Pipeline failed:", error);
            intelligence.status = "failed";
            intelligence.error = error.message || "AI Analysis failed";
            await intelligence.save();

            if (job?._id) {
                await aiJobService.failJob(job._id, error.message);
            }

            throw error;
        }
    }

    /**
     * Get the latest intelligence analysis with strong version-aware staleness detection
     */
    async getLessonIntelligence(lessonId, userId) {
        const { lesson } = await this.verifyLessonOwnership(lessonId, userId);

        const intelligence = await LessonIntelligence.findOne({ lesson: lessonId })
            .sort("-version")
            .populate("sourceMedia", "url cloudflareId type duration thumbnail version");

        if (!intelligence) {
            return null;
        }

        // Deterministic staleness check:
        // Stale if:
        // 1. Current lesson media ID does not match source media ID
        // 2. OR current lesson media version does not match source media version
        const currentMediaId = lesson.media?._id?.toString() || null;
        const currentMediaVersion = lesson.media?.version || 1;
        const sourceMediaId = intelligence.sourceMedia?._id?.toString() || intelligence.sourceMedia?.toString() || null;
        const sourceMediaVersion = intelligence.sourceMediaVersion || 1;

        intelligence.isStale = (sourceMediaId !== currentMediaId) || (sourceMediaVersion !== currentMediaVersion);

        return intelligence;
    }

    /**
     * Creator explicitly approves AI suggestions into canonical lesson metadata with provenance
     */
    async acceptLessonIntelligence(lessonId, userId, acceptedPayload) {
        const { lesson } = await this.verifyLessonOwnership(lessonId, userId);

        const intelligence = await LessonIntelligence.findOne({ lesson: lessonId }).sort("-version");
        if (!intelligence) {
            throw new NotFoundException("No AI intelligence found to accept");
        }

        if (intelligence.status !== "completed") {
            throw new BadRequestException("Cannot accept incomplete or failed AI intelligence");
        }

        // Verify Staleness: Reject acceptance if media changed
        const currentMediaId = lesson.media?._id?.toString() || null;
        const currentMediaVersion = lesson.media?.version || 1;
        const sourceMediaId = intelligence.sourceMedia?.toString() || null;
        const sourceMediaVersion = intelligence.sourceMediaVersion || 1;

        if (sourceMediaId !== currentMediaId || sourceMediaVersion !== currentMediaVersion) {
            throw new BadRequestException(
                "Cannot accept stale AI analysis. The lesson video was updated after this analysis was generated. Please regenerate first."
            );
        }

        const acceptedFields = [];

        // Apply validated changes atomically
        if (acceptedPayload.summary) {
            lesson.summary = String(acceptedPayload.summary.detailed || acceptedPayload.summary.short || "").trim();
            if (acceptedPayload.summary.short) {
                lesson.description = String(acceptedPayload.summary.short).trim();
            }
            acceptedFields.push("summary");
        }

        if (Array.isArray(acceptedPayload.keyPoints) && acceptedPayload.keyPoints.length > 0) {
            lesson.keyPoints = Array.from(new Set(acceptedPayload.keyPoints.map(String).filter(Boolean)));
            acceptedFields.push("keyPoints");
        }

        if (Array.isArray(acceptedPayload.learningObjectives) && acceptedPayload.learningObjectives.length > 0) {
            lesson.learningObjectives = Array.from(new Set(acceptedPayload.learningObjectives.map(String).filter(Boolean)));
            acceptedFields.push("learningObjectives");
        }

        if (Array.isArray(acceptedPayload.concepts) && acceptedPayload.concepts.length > 0) {
            lesson.concepts = Array.from(new Set(acceptedPayload.concepts.map(String).filter(Boolean)));
            acceptedFields.push("concepts");
        }

        if (Array.isArray(acceptedPayload.keywords) && acceptedPayload.keywords.length > 0) {
            lesson.keywords = Array.from(new Set(acceptedPayload.keywords.map(String).filter(Boolean)));
            acceptedFields.push("keywords");
        }

        const videoChapters = acceptedPayload.suggestedVideoChapters || acceptedPayload.suggestedChapters;
        if (Array.isArray(videoChapters) && videoChapters.length > 0) {
            const sortedChapters = videoChapters
                .filter((ch) => ch && ch.title)
                .map((ch) => ({
                    timestamp: String(ch.timestamp || "00:00").trim(),
                    seconds: Number(ch.seconds || 0),
                    title: String(ch.title).trim(),
                    summary: String(ch.summary || "").trim(),
                }))
                .sort((a, b) => a.seconds - b.seconds);

            lesson.suggestedVideoChapters = sortedChapters;
            lesson.suggestedChapters = sortedChapters; // backward compatibility
            acceptedFields.push("suggestedVideoChapters");
        }

        // Persist structured AI provenance metadata on canonical Lesson
        lesson.aiIntelligence = {
            intelligenceId: intelligence._id,
            acceptedVersion: intelligence.version,
            acceptedAt: new Date(),
            acceptedBy: userId,
            model: intelligence.model,
            promptVersion: intelligence.promptVersion,
            sourceMediaVersion: intelligence.sourceMediaVersion || 1,
        };

        await lesson.save();

        // Update Intelligence document
        intelligence.acceptedAt = new Date();
        intelligence.acceptedFields = acceptedFields;
        await intelligence.save();

        return { lesson, intelligence, acceptedFields };
    }

    /**
     * Get transcript for a lesson on-demand
     */
    async getLessonTranscript(lessonId, userId) {
        await this.verifyLessonOwnership(lessonId, userId);

        const intelligence = await LessonIntelligence.findOne({ lesson: lessonId })
            .sort("-version")
            .select("transcript lesson status version isStale");

        if (!intelligence || !intelligence.transcript) {
            throw new NotFoundException("Transcript not found for this lesson");
        }

        return intelligence.transcript;
    }
}

module.exports = new CourseIntelligenceService();
