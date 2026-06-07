const express = require("express");
const { Controller } = require("../core");
const { seriesService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { default: slugify } = require("slugify");

class SeriesController extends Controller {
    _rootPath = "/series";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    getSeries = asyncHandler(async (req, res) => {
        const series = await seriesService.getAll();
        res.status(200).json({
            series: series,
        });
    });

    getSeriesByUser = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const series = await seriesService.getSeriesByUser(_id);
        res.status(200).json({
            status: "success",
            series: series,
        });
    });

    getMarkedByUser = asyncHandler(async (req, res) => {
        const { profileId } = req.query;
        const markedSeries = await seriesService.getMarkedByUser(profileId);
        res.status(200).json({
            status: "success",
            markedSeries: markedSeries,
        });
    });

    getSeriesByAuthorId = asyncHandler(async (req, res) => {
        const profileId = req.query.profileId;
        const series = await seriesService.getSeriesByUser(profileId);

        res.status(200).json({ series });
    });

    getHotSeries = asyncHandler(async (req, res) => {
        const series = await seriesService.getHotSeries();
        res.status(200).json({
            status: "success",
            series: series,
        });
    });

    getSeriesBySlug = asyncHandler(async (req, res) => {
        const { slug } = req.query;
        const series = await seriesService.getSeriesBySlug(slug);
        res.status(200).json({
            data: series,
        });
    });

    getAnotherSeriesBySlug = asyncHandler(async (req, res) => {
        const { slug } = req.query;
        const anotherSeries = await seriesService.getAnotherSeriesBySlug(slug);
        res.status(200).json({
            status: "success",
            anotherSeries: anotherSeries,
        });
    });

    createSeries = asyncHandler(async (req, res) => {
        const { _id } = req.userInfo;
        const series = await seriesService.createSeries({
            title: req.body.newSeries,
            slug: slugify(req.body.newSeries, {
                lower: true,
                strict: true,
            }),
            userId: _id,
        });
        res.status(201).json({
            status: "success",
            data: series,
        });
    });

    editSeries = asyncHandler(async (req, res) => {
        const { seriesId, title, description, image } = req.body;
        const series = await seriesService.editSeries(seriesId, { title, description, image });
        res.status(200).json({
            status: "success",
            data: series,
        });
    });

    update = asyncHandler(async (req, res) => {
        const { _id, title, slug, description } = req.body;
        const series = await seriesService.updateSeries(_id, title, description);
        res.status(200).json({
            status: "success",
            series: series,
        });
    });

    markSeries = asyncHandler(async (req, res) => {
        const { seriesId } = req.body;
        const { _id } = req.userInfo;
        const isMarked = await seriesService.markedSeries(seriesId, _id);
        return res.status(200).json({ isMarked });
    });

    deleteSeries = asyncHandler(async (req, res) => {
        const { seriesId } = req.body;
        await seriesService.deleteSeries(seriesId);

        res.status(200).json({
            status: "success",
            message: "Series deleted successfully",
        });
    });

    enroll = asyncHandler(async (req, res) => {
        const { seriesId } = req.body;
        const { _id } = req.userInfo;
        const series = await seriesService.enroll(seriesId, _id);
        res.status(200).json({
            status: "success",
            data: series,
        });
    });

    updatePrice = asyncHandler(async (req, res) => {
        const { seriesId, price } = req.body;
        const series = await seriesService.updatePrice(seriesId, price);
        res.status(200).json({
            status: "success",
            data: series,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, AuthMiddleware, this.getSeries);
        this._router.get(`${this._rootPath}/getByUser`, AuthMiddleware, this.getSeriesByUser);
        this._router.get(`${this._rootPath}/getMarkedByUser`, this.getMarkedByUser);
        this._router.get(`${this._rootPath}/getSeriesByAuthorId`, this.getSeriesByAuthorId);
        this._router.get(`${this._rootPath}/getHotSeries`, this.getHotSeries);
        this._router.get(`${this._rootPath}/getSeriesBySlug`, this.getSeriesBySlug);
        this._router.get(`${this._rootPath}/getAnotherSeriesBySlug`, this.getAnotherSeriesBySlug);
        this._router.post(`${this._rootPath}/create`, AuthMiddleware, this.createSeries);
        this._router.patch(`${this._rootPath}/edit`, AuthMiddleware, this.editSeries);
        this._router.patch(`${this._rootPath}/update`, AuthMiddleware, this.update);
        this._router.patch(`${this._rootPath}/markSeries`, AuthMiddleware, this.markSeries);
        this._router.patch(`${this._rootPath}/updatePrice`, AuthMiddleware, this.updatePrice);
        this._router.post(`${this._rootPath}/enroll`, AuthMiddleware, this.enroll);
        this._router.delete(`${this._rootPath}/delete`, AuthMiddleware, this.deleteSeries);
    };
}

module.exports = SeriesController;