const express = require("express");
const { Controller } = require("../core");
const { seriesService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { slugify } = require("../services/post.services");

class SeriesController extends Controller {
    _rootPath = "/series";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getSeries = asyncHandler(async (req, res) => {
        console.log('Call function get series');
        const series = await seriesService.getAll();
        res.status(200).json({
            status: "success",
            data: series,
        });
    });

    getSeriesByUser = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        console.log('getSeriesByUser', _id);
        const series = await seriesService.getSeriesByUser(_id);
        res.status(200).json({
            status: "success",
            series: series,
        });
    });

    getMarkedByUser = asyncHandler(async (req, res) => {
        const { profileId } = req.query;
        console.log('getMarkedByUser', profileId);
        try {
            const markedSeries = await seriesService.getMarkedByUser(profileId);
            res.status(200).json({
                status: "success",
                markedSeries: markedSeries,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    });

    createSeries = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const series = await seriesService.createSeries({
            title: req.body.newSeries,
            slug: slugify(req.body.newSeries),
            userId: _id,
        });
        res.status(201).json({
            status: "success",
            data: series,
        });
    });

    editSeries = asyncHandler(async (req, res) => {
        const { seriesId, title, description, image } = req.body;
        console.log('Call function editSeries', seriesId, title, description, image);
        try {
            const series = await seriesService.editSeries(seriesId, { title, description, image });
            res.status(200).json({
                status: "success",
                data: series,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }

    });

    markSeries = asyncHandler(async (req, res) => {
        console.log('Call function markedSeries');
        const { seriesId } = req.body;
        const { _id } = req.userInfo;
        try {
            const isMarked = await seriesService.markedSeries(seriesId, _id);
            return res.status(200).json({ isMarked });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getSeries);
        this._router.get(`${this._rootPath}/getByUser`, AuthMiddleware, this.getSeriesByUser);
        this._router.get(`${this._rootPath}/getMarkedByUser`, this.getMarkedByUser);
        this._router.post(`${this._rootPath}/create`, AuthMiddleware, this.createSeries);
        this._router.patch(`${this._rootPath}/edit`, AuthMiddleware, this.editSeries);
        this._router.patch(`${this._rootPath}/markSeries`, AuthMiddleware, this.markSeries);
    };
}

module.exports = SeriesController;