const express = require("express");
const { Controller } = require("../core");
const { userService } = require("../services");
const { AdminMiddleware, AuthMiddleware } = require("../middlewares/auth.middleware");
const { ServerException } = require("../exceptions");

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

  async updateImage(req, res, next) {
    const { _id } = req.userInfo;
    try {
      if (!_id) {
        throw new ServerException("No id found");
      }
      const { avatar, background } = req.body;

      if (avatar) {
        userService.updateAvatar(avatar, _id);
      } else {
        userService.updateBackground(background, _id);
      }
      return res.status(200).json({
        message: "success",
      });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }

  initController = () => {
    this._router.get(`${this._rootPath}`, AdminMiddleware, this.getAll);
    this._router.patch(
      `${this._rootPath}/updateImage`, AuthMiddleware, this.updateImage
    );
  };
}

module.exports = UserController;
