const express = require("express");
const { Controller } = require("../core");
const { userService } = require("../services");
const { mediaService } = require("../services");
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
        mediaService.addMedia(_id, avatar, "image");
      } else {
        userService.updateBackground(background, _id);
        mediaService.addMedia(_id, avatar, "image");
      }
      return res.status(200).json({
        message: "success",
      });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }

  async updateProfile(req, res, next) {
    const { _id } = req.userInfo;
    try {
      if (!_id) {
        throw new ServerException("No id found");
      }
      const { name, bio } = req.body;

      userService.updateProfile(name, bio, _id);

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
    this._router.patch(
      `${this._rootPath}/updateProfile`, AuthMiddleware, this.updateProfile
    );
  };
}

module.exports = UserController;
