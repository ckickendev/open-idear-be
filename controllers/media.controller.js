const express = require("express");
const { Controller } = require("../core");
const { mediaService } = require("../services")

class MediaController extends Controller {
    _rootPath = "/media";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const medias = await mediaService.getAll();
        res.json({
            medias
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = MediaController;
