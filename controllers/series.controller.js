const express = require("express");
const { Controller } = require("../core");
const { seriesService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

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
            data: series,
        });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getSeries);
        this._router.get(`${this._rootPath}/getByUser`, AuthMiddleware, this.getSeriesByUser);
    };
}

module.exports = SeriesController;