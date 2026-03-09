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
        const { title } = req.body;
        const course = await courseService.createCourse({ title, instructorId: _id });
        res.status(201).json({ status: "success", data: course });
    });

    updateCourse = asyncHandler(async (req, res) => {
        const { courseId, ...updateData } = req.body;
        const course = await courseService.updateCourse(courseId, updateData);
        res.status(200).json({ status: "success", data: course });
    });

    addLesson = asyncHandler(async (req, res) => {
        const { courseId, ...lessonData } = req.body;
        const lesson = await courseService.addLesson(courseId, lessonData);
        res.status(201).json({ status: "success", data: lesson });
    });

    updateLesson = asyncHandler(async (req, res) => {
        const { lessonId, ...updateData } = req.body;
        const lesson = await courseService.updateLesson(lessonId, updateData);
        res.status(200).json({ status: "success", data: lesson });
    });

    enroll = asyncHandler(async (req, res) => {
        const { courseId } = req.body;
        const { _id } = req.userInfo;
        const course = await courseService.enroll(courseId, _id);
        res.status(200).json({ status: "success", data: course });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getCourses);
        this._router.get(`${this._rootPath}/getById`, this.getCourseById);
        this._router.get(`${this._rootPath}/getBySlug`, this.getCourseBySlug);
        this._router.post(`${this._rootPath}/create`, AuthMiddleware, this.createCourse);
        this._router.patch(`${this._rootPath}/update`, AuthMiddleware, this.updateCourse);
        this._router.post(`${this._rootPath}/lesson/add`, AuthMiddleware, this.addLesson);
        this._router.patch(`${this._rootPath}/lesson/update`, AuthMiddleware, this.updateLesson);
        this._router.post(`${this._rootPath}/enroll`, AuthMiddleware, this.enroll);
    };
}

module.exports = CourseController;
