const express = require("express");
const { Controller } = require("../core");
const { enrollmentService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

class EnrollmentController extends Controller {
    _rootPath = "/enrollment";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getMyEnrollments = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const result = await enrollmentService.getMyEnrollments(_id);
        res.status(200).json({ status: "success", ...result });
    });

    checkEnrollment = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { courseId } = req.query;
        if (!courseId) {
            return res.status(400).json({ status: "error", error: "courseId is required" });
        }
        const canAccess = await enrollmentService.canAccessCourse(_id, courseId);
        let enrollment = null;
        if (canAccess) {
            enrollment = await enrollmentService.getEnrollment(_id, courseId);
        }
        res.status(200).json({
            status: "success",
            data: { enrolled: canAccess, enrollment },
        });
    });

    completeLesson = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { courseId, lessonId } = req.body;
        if (!courseId || !lessonId) {
            return res.status(400).json({
                status: "error",
                error: "courseId and lessonId are required",
            });
        }
        const result = await enrollmentService.completeLesson(_id, courseId, lessonId);
        res.status(200).json({ status: "success", data: result });
    });

    initController = () => {
        this._router.get(`${this._rootPath}/my-courses`, AuthMiddleware, this.getMyEnrollments);
        this._router.get(`${this._rootPath}/check`, AuthMiddleware, this.checkEnrollment);
        this._router.post(`${this._rootPath}/lesson/complete`, AuthMiddleware, this.completeLesson);
    };
}

module.exports = EnrollmentController;
