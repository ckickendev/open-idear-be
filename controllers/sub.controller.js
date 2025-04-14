const express = require("express");
const { Controller } = require("../core");
const { subService } = require("../services")

class SubController extends Controller {
    _rootPath = "/sub";
    _router = express.Router();
    constructor() {
        super();
        this.initController();
    }

    async getAll(req, res, next) {
        const subs = await subService.getAll();
        res.json({
            subs
        })
    }

    initController = () => {
        this._router.get(`${this._rootPath}`, this.getAll);
    };
}

module.exports = SubController;
