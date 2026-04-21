const express = require("express");
const { Controller } = require("../core");
const { courseService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

class CourseController extends Controller {
    _rootPath = "/course";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getCourses = asyncHandler(async (req, res) => {
        const { keyword, category, status, minPrice, maxPrice, sort, page, limit } = req.query;
        const result = await courseService.findCourses({
            keyword,
            category,
            status,
            minPrice,
            maxPrice,
            sort,
            page,
            limit
        });
        res.status(200).json({ status: "success", ...result });
    });

    getCourseBySlug = asyncHandler(async (req, res) => {
        const { slug } = req.query;
        const course = await courseService.getCourseBySlug(slug);
        res.status(200).json({ status: "success", data: course });
    });

    getCourseById = asyncHandler(async (req, res) => {
        const { id } = req.query;
        const course = await courseService.getCourseById(id);
        res.status(200).json({ status: "success", data: course });
    });

    createCourse = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const { title, categoryIds, topicIds } = req.body;
        const course = await courseService.createCourse({ title, instructorId: _id, categoryIds, topicIds });
        res.status(201).json({ status: "success", data: course });
    });

    updateCourse = asyncHandler(async (req, res) => {
        const { courseId, ...updateData } = req.body;
        const course = await courseService.updateCourse(courseId, updateData);
        res.status(200).json({ status: "success", data: course });
    });

    addChapter = asyncHandler(async (req, res) => {
        const { courseId, ...chapterData } = req.body;
        const chapter = await courseService.addChapter(courseId, chapterData);
        res.status(201).json({ status: "success", data: chapter });
    });

    updateChapter = asyncHandler(async (req, res) => {
        const { chapterId, ...updateData } = req.body;
        const chapter = await courseService.updateChapter(chapterId, updateData);
        res.status(200).json({ status: "success", data: chapter });
    });

    deleteChapter = asyncHandler(async (req, res) => {
        const { chapterId } = req.body;
        const chapter = await courseService.deleteChapter(chapterId);
        res.status(200).json({ status: "success", data: chapter });
    });

    addLesson = asyncHandler(async (req, res) => {
        const { chapterId, ...lessonData } = req.body;
        const lesson = await courseService.addLesson(chapterId, lessonData);
        res.status(201).json({ status: "success", data: lesson });
    });

    updateLesson = asyncHandler(async (req, res) => {
        const { lessonId, ...updateData } = req.body;
        const lesson = await courseService.updateLesson(lessonId, updateData);
        res.status(200).json({ status: "success", data: lesson });
    });

    moveLesson = asyncHandler(async (req, res) => {
        const { lessonId, sourceChapterId, targetChapterId } = req.body;
        const lesson = await courseService.moveLesson(lessonId, sourceChapterId, targetChapterId);
        res.status(200).json({ status: "success", data: lesson });
    });

    deleteLesson = asyncHandler(async (req, res) => {
        const { lessonId } = req.body;
        const lesson = await courseService.deleteLesson(lessonId);
        res.status(200).json({ status: "success", data: lesson });
    });

    enroll = asyncHandler(async (req, res) => {
        const { courseId } = req.body;
        const { _id } = req.userInfo;
        const course = await courseService.enroll(courseId, _id);
        res.status(200).json({ status: "success", data: course });
    });

    getMyCourses = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const result = await courseService.getMyCourses(_id);
        res.status(200).json({ status: "success", ...result });
    });

    getEnrolledCourses = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const result = await courseService.getEnrolledCourses(_id);
        res.status(200).json({ status: "success", ...result });
    });

    rateCourse = asyncHandler(async (req, res) => {
        const { _id: userId } = req.userInfo;
        const { courseId, score, comment } = req.body;
        const review = await courseService.rateCourse(courseId, userId, score, comment);
        res.status(200).json({ status: "success", data: review });
    });

    getCourseReviews = asyncHandler(async (req, res) => {
        const { courseId, page, limit } = req.query;
        const result = await courseService.getCourseReviews(courseId, page, limit);
        res.status(200).json({ status: "success", ...result });
    });

    updateCurriculum = asyncHandler(async (req, res) => {
        const { courseId } = req.query;
        const course = await courseService.updateCurriculum(courseId, req.body);
        res.status(200).json({ status: "success", data: course });
    });

    deleteCourse = asyncHandler(async (req, res) => {
        const { courseId } = req.query;
        const course = await courseService.deleteCourse(courseId);
        res.status(200).json({ status: "success", data: course });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getCourses);
        this._router.get(`${this._rootPath}/me`, AuthMiddleware, this.getMyCourses);
        this._router.get(`${this._rootPath}/enrolled`, AuthMiddleware, this.getEnrolledCourses);
        this._router.get(`${this._rootPath}/getById`, this.getCourseById);
        this._router.get(`${this._rootPath}/getBySlug`, this.getCourseBySlug);
        this._router.get(`${this._rootPath}/reviews`, this.getCourseReviews);
        this._router.post(`${this._rootPath}/create`, AuthMiddleware, this.createCourse);
        this._router.post(`${this._rootPath}/rate`, AuthMiddleware, this.rateCourse);
        this._router.patch(`${this._rootPath}/update`, AuthMiddleware, this.updateCourse);

        // Chapter routes
        this._router.post(`${this._rootPath}/chapter/add`, AuthMiddleware, this.addChapter);
        this._router.patch(`${this._rootPath}/chapter/update`, AuthMiddleware, this.updateChapter);
        this._router.delete(`${this._rootPath}/chapter/delete`, AuthMiddleware, this.deleteChapter);

        // Lesson routes
        this._router.post(`${this._rootPath}/lesson/add`, AuthMiddleware, this.addLesson);
        this._router.patch(`${this._rootPath}/lesson/update`, AuthMiddleware, this.updateLesson);
        this._router.patch(`${this._rootPath}/lesson/move`, AuthMiddleware, this.moveLesson);
        this._router.delete(`${this._rootPath}/lesson/delete`, AuthMiddleware, this.deleteLesson);

        this._router.patch(`${this._rootPath}/curriculum`, AuthMiddleware, this.updateCurriculum);
        this._router.delete(`${this._rootPath}`, AuthMiddleware, this.deleteCourse);
        this._router.post(`${this._rootPath}/enroll`, AuthMiddleware, this.enroll);
    };
}

module.exports = CourseController;
