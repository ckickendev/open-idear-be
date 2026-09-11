const express = require("express");
const { Controller } = require("../core");
const courseIntelligenceService = require("../services/courseIntelligence.services");
const knowledgeCheckService = require("../services/knowledgeCheck.services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware, OptionalAuthMiddleware } = require("../middlewares/auth.middleware");

class CourseIntelligenceController extends Controller {
    _rootPath = "/ai/course";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    /**
     * POST /ai/course/lesson/:lessonId/analyze
     */
    analyzeLesson = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;
        const { force, language } = req.body;

        const result = await courseIntelligenceService.analyzeLesson(lessonId, _id, {
            force: Boolean(force),
            language: language || "vi",
        });

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/analysis
     */
    getLessonIntelligence = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await courseIntelligenceService.getLessonIntelligence(lessonId, _id);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * POST /ai/course/lesson/:lessonId/accept
     */
    acceptLessonIntelligence = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;
        const acceptedPayload = req.body;

        const result = await courseIntelligenceService.acceptLessonIntelligence(lessonId, _id, acceptedPayload);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/transcript
     */
    getLessonTranscript = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await courseIntelligenceService.getLessonTranscript(lessonId, _id);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * POST /ai/course/lesson/:lessonId/knowledge-check/generate
     */
    generateKnowledgeCheck = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;
        const { force, count } = req.body;

        const result = await knowledgeCheckService.generateKnowledgeCheck(lessonId, _id, {
            force: Boolean(force),
            count: Number(count) || 4,
        });

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/knowledge-check
     */
    getKnowledgeCheck = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await knowledgeCheckService.getKnowledgeCheck(lessonId, _id);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * PATCH /ai/course/lesson/:lessonId/knowledge-check/:checkId
     */
    updateKnowledgeCheck = asyncHandler(async (req, res) => {
        const { lessonId, checkId } = req.params;
        const { _id } = req.userInfo;

        const result = await knowledgeCheckService.updateKnowledgeCheck(lessonId, checkId, _id, req.body);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * POST /ai/course/lesson/:lessonId/knowledge-check/:checkId/accept
     */
    acceptKnowledgeCheck = asyncHandler(async (req, res) => {
        const { lessonId, checkId } = req.params;
        const { _id } = req.userInfo;

        const result = await knowledgeCheckService.acceptKnowledgeCheck(lessonId, checkId, _id);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/knowledge-check/learner (Learner view, stripped answers)
     */
    getLearnerKnowledgeCheck = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;

        const result = await knowledgeCheckService.getLearnerKnowledgeCheck(lessonId);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * POST /ai/course/lesson/:lessonId/knowledge-check/attempt (Submit quiz attempt)
     */
    submitKnowledgeCheckAttempt = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;
        const { answers } = req.body;

        const result = await knowledgeCheckService.submitAttempt(lessonId, _id, answers);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/knowledge-check/attempts
     */
    getLearnerAttempts = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await knowledgeCheckService.getLearnerAttempts(lessonId, _id);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/tutor/session
     */
    getTutorSession = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await tutorService.getOrCreateSession(_id, lessonId);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /ai/course/lesson/:lessonId/tutor/messages/:sessionId
     */
    getTutorMessages = asyncHandler(async (req, res) => {
        const { sessionId } = req.params;
        const { _id } = req.userInfo;

        const result = await tutorService.getSessionMessages(sessionId, _id);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * POST /ai/course/lesson/:lessonId/tutor/message
     */
    sendTutorMessage = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;
        const { message, sessionId, timestampSeconds } = req.body;

        const result = await tutorService.sendMessage({
            userId: _id,
            lessonId,
            sessionId,
            message,
            timestampSeconds: typeof timestampSeconds === "number" ? timestampSeconds : undefined,
        });

        res.status(200).json({ status: "success", data: result });
    });

    initController = () => {
        // Intelligence APIs
        this._router.post(`${this._rootPath}/lesson/:lessonId/analyze`, AuthMiddleware, this.analyzeLesson);
        this._router.get(`${this._rootPath}/lesson/:lessonId/analysis`, AuthMiddleware, this.getLessonIntelligence);
        this._router.post(`${this._rootPath}/lesson/:lessonId/accept`, AuthMiddleware, this.acceptLessonIntelligence);
        this._router.get(`${this._rootPath}/lesson/:lessonId/transcript`, AuthMiddleware, this.getLessonTranscript);

        // Creator Knowledge Check APIs
        this._router.post(`${this._rootPath}/lesson/:lessonId/knowledge-check/generate`, AuthMiddleware, this.generateKnowledgeCheck);
        this._router.get(`${this._rootPath}/lesson/:lessonId/knowledge-check`, AuthMiddleware, this.getKnowledgeCheck);
        this._router.patch(`${this._rootPath}/lesson/:lessonId/knowledge-check/:checkId`, AuthMiddleware, this.updateKnowledgeCheck);
        this._router.post(`${this._rootPath}/lesson/:lessonId/knowledge-check/:checkId/accept`, AuthMiddleware, this.acceptKnowledgeCheck);

        // Learner Knowledge Check APIs
        this._router.get(`${this._rootPath}/lesson/:lessonId/knowledge-check/learner`, OptionalAuthMiddleware, this.getLearnerKnowledgeCheck);
        this._router.post(`${this._rootPath}/lesson/:lessonId/knowledge-check/attempt`, AuthMiddleware, this.submitKnowledgeCheckAttempt);
        this._router.get(`${this._rootPath}/lesson/:lessonId/knowledge-check/attempts`, AuthMiddleware, this.getLearnerAttempts);

        // AI Learning Companion (Tutor) APIs
        this._router.get(`${this._rootPath}/lesson/:lessonId/tutor/session`, AuthMiddleware, this.getTutorSession);
        this._router.get(`${this._rootPath}/lesson/:lessonId/tutor/messages/:sessionId`, AuthMiddleware, this.getTutorMessages);
        this._router.post(`${this._rootPath}/lesson/:lessonId/tutor/message`, AuthMiddleware, this.sendTutorMessage);
    };
}

module.exports = CourseIntelligenceController;
