const express = require("express");
const { Controller } = require("../core");
const { userService } = require("../services")

class UserController extends Controller {
  _rootPath = "/user";
  _router = express.Router();
  constructor() {
    super();
    this.initController();
  }

  async getAll(req, res, next) {
    const users = await userService.getAllUser();
    res.json({
        users
    })
  }

  initController = () => {
    this._router.get(`${this._rootPath}`, this.getAll);
  };
}

module.exports = UserController;
