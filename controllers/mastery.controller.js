const express = require("express");
const { Controller } = require("../core");
const masteryService = require("../services/mastery.services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

class MasteryController extends Controller {
    _rootPath = "/learning";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    /**
     * GET /learning/mastery/lesson/:lessonId
     * Retrieve objective-level mastery with explainability for the learner
     */
    getLessonMastery = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await masteryService.getLessonMastery(_id, lessonId);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /learning/mastery/course/:courseId
     * Retrieve course-level mastery overview for the learner
     */
    getCourseMastery = asyncHandler(async (req, res) => {
        const { courseId } = req.params;
        const { _id } = req.userInfo;

        const result = await masteryService.getCourseMastery(_id, courseId);

        res.status(200).json({ status: "success", data: result });
    });

    /**
     * GET /learning/evidence/lesson/:lessonId
     * Retrieve recent learning evidence signals for the learner
     */
    getRecentEvidence = asyncHandler(async (req, res) => {
        const { lessonId } = req.params;
        const { _id } = req.userInfo;

        const result = await masteryService.getRecentEvidence(_id, lessonId);

        res.status(200).json({ status: "success", data: result });
    });

    initController = () => {
        this._router.get(`${this._rootPath}/mastery/lesson/:lessonId`, AuthMiddleware, this.getLessonMastery);
        this._router.get(`${this._rootPath}/mastery/course/:courseId`, AuthMiddleware, this.getCourseMastery);
        this._router.get(`${this._rootPath}/evidence/lesson/:lessonId`, AuthMiddleware, this.getRecentEvidence);
    };
}

module.exports = MasteryController;
