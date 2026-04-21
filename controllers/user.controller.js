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
    const { status } = req.query;
    const users = await userService.getAllUser(status);
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

  async lockUser(req, res, next) {
    try {
      const { userId } = req.query;
      const user = await userService.updateUser(userId, { activate: false });
      return res.status(200).json({ message: "User locked successfully", user });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async updateRole(req, res, next) {
    try {
      const { userId, roleNum } = req.query;
      const user = await userService.updateUser(userId, { role: Number(roleNum) });
      return res.status(200).json({ message: "Role updated successfully", user });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async createUser(req, res, next) {
    try {
      const user = await userService.createUser(req.body);
      return res.status(201).json({ message: "User created successfully", user });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const user = await userService.updateUser(id, req.body);
      return res.status(200).json({ message: "User updated successfully", user });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;
      await userService.deleteUser(id);
      return res.status(200).json({ message: "User deleted successfully" });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async restoreUser(req, res, next) {
    try {
      const { id } = req.params;
      await userService.restoreUser(id);
      return res.status(200).json({ message: "User restored successfully" });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const { id } = req.params;
      const user = await userService.toggleUserStatus(id);
      return res.status(200).json({ message: "Status toggled successfully", user });
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
    this._router.post(`${this._rootPath}/updateRole`, AdminMiddleware, this.updateRole);
    this._router.post(`${this._rootPath}/lockUser`, AdminMiddleware, this.lockUser);
    this._router.post(`${this._rootPath}/create`, AdminMiddleware, this.createUser);
    this._router.patch(`${this._rootPath}/update/:id`, AdminMiddleware, this.updateUser);
    this._router.delete(`${this._rootPath}/delete/:id`, AdminMiddleware, this.deleteUser);
    this._router.patch(`${this._rootPath}/restore/:id`, AdminMiddleware, this.restoreUser);
    this._router.patch(`${this._rootPath}/toggle-status/:id`, AdminMiddleware, this.toggleStatus);
  };

}

module.exports = UserController;
