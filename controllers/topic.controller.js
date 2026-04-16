const express = require("express");
const { Controller } = require("../core");
const { topicService } = require("../services");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler");

class TopicController extends Controller {
    _rootPath = "/topic";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getAll = asyncHandler(async (req, res) => {
        const topics = await topicService.getAll();
        res.json({ success: true, data: topics });
    });

    createTopic = asyncHandler(async (req, res) => {
        const { name, description } = req.body;
        const topic = await topicService.createTopic({ name, description });
        res.status(201).json({ success: true, data: topic });
    });

    updateTopic = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const topic = await topicService.updateTopic(id, req.body);
        res.json({ success: true, data: topic });
    });

    deleteTopic = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const topic = await topicService.deleteTopic(id);
        res.json({ success: true, data: topic });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
        this._router.post(`${this._rootPath}/create`, AdminMiddleware, this.createTopic);
        this._router.patch(`${this._rootPath}/update/:id`, AdminMiddleware, this.updateTopic);
        this._router.delete(`${this._rootPath}/delete/:id`, AdminMiddleware, this.deleteTopic);
    };
}

module.exports = TopicController;
