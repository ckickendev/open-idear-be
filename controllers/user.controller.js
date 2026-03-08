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
        throw new ServerException("User ID not found in token");
      }
      const { avatar, background } = req.body;

      if (avatar) {
        await userService.updateUser(_id, { avatar });
        await mediaService.addMedia(_id, avatar, "image");
      } else if (background) {
        await userService.updateUser(_id, { background });
        await mediaService.addMedia(_id, background, "image");
      } else {
        return res.status(400).json({ error: "No image data provided" });
      }

      return res.status(200).json({
        message: "Image updated successfully",
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async updateProfile(req, res, next) {
    const { _id } = req.userInfo;
    try {
      if (!_id) {
        throw new ServerException("User ID not found in token");
      }

      const updateData = req.body.data || req.body;
      const { name, bio } = updateData;

      if (!name && !bio) {
        return res.status(400).json({ error: "No profile data provided" });
      }

      await userService.updateUser(_id, { name, bio });

      return res.status(200).json({
        message: "Profile updated successfully",
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
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
