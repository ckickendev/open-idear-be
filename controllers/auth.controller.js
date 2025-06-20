const express = require("express");
const bcrypt = require("bcrypt");
const { Controller, ConsoleLogger } = require("../core");
const {
  NotFoundException,
  BadRequestException,
  ServerException,
  ForbiddenException,
  UnauthorizedException,
} = require("../exceptions");
const { User } = require("../models");
const userServices = require("../services/user.services");
const authServices = require("../services/auth.services");
const { AuthMiddleware } = require("../middlewares/auth.middleware");

// Wrapper để tránh lặp try/catch
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

class AuthController extends Controller {
  _rootPath = "/auth";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  async login(req, res) {
    const { email, _id, role } = req.user;
    const payload = { id: _id, email, role };
    const token = await authServices.generateToken(payload);
    const refreshToken = await authServices.generateRefreshToken(payload);

    ConsoleLogger.info(token);
    return res.status(200).json({
      message: "Login Success",
      data: {
        access_token: token,
        refresh_token: refreshToken,
        user: payload,
      },
    });
  }

  async register(req, res) {
    const { email, username, password } = req.body;
    await userServices.register(email, username, password);
    return res.status(200).json({
      message: "Register Success",
      user: email,
    });
  }

  async getProfile(req, res) {
    const userId = req.userInfo._id;
    const userInfo = await userServices.findUserById(userId);
    if (!userInfo) throw new NotFoundException("User not found !");

    const userFilter = {
      _id: userInfo._id,
      username: userInfo.username,
      name: userInfo.name,
      email: userInfo.email,
      role: userInfo.role,
      activate: userInfo.activate,
      createdAt: userInfo.createdAt,
      bio: userInfo.bio,
      avatar: userInfo.avatar,
      background: userInfo.background,
    };

    return res.status(200).json({ message: "success", userInfo: userFilter });
  }

  async validateBeforeLogin(req, res, next) {
    const { account, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: account }, { username: account }],
    });
    if (!user) throw new NotFoundException("User not found");

    const isPasswordTrue = await bcrypt.compare(password, user.password);
    if (!isPasswordTrue)
      throw new BadRequestException("Password incorrect ! Please try again");

    if (!user.activate)
      throw new ForbiddenException(
        "Your account is not activated, please check your email."
      );

    req.user = user;
    next();
  }

  async validateBeforeRegister(req, res, next) {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) throw new ServerException("User exists");
    next();
  }

  async confirmSignup(req, res) {
    const { token, user_authen } = req.body;
    if (!token || !user_authen)
      throw new BadRequestException("Missing token or user info");

    const result = await userServices.confirmToken(token, user_authen);

    if (result === 1) {
      return res.status(200).json({
        message:
          "Your account is registered successfully, redirecting to login!",
        user: user_authen,
      });
    } else if (result === 0) {
      throw new BadRequestException(
        "Your code/link is not correct, please check again."
      );
    } else {
      return res.status(200).json({
        message: `Your account (${user_authen}) is already activated.`,
        user: user_authen,
      });
    }
  }

  async sendEmailResetPass(req, res) {
    const { account } = req.body;
    const user = await userServices.findUserByAccount(account);
    if (!user)
      throw new ServerException("Cannot find user! Please try again.");

    await userServices.sendEmailResetPass(user.email);

    return res.status(200).json({
      status: 200,
      email: user.email.replace(/(.{3}).*(@.*)/, "$1***$2"),
      message: "Email sent, please check your inbox!",
    });
  }

  async confirmNewPassword(req, res) {
    const { emailSent, password } = req.body;
    await userServices.confirmNewPassword(emailSent, password);
    return res.status(200).json({
      message: "Password changed, please return to homepage and check again!",
    });
  }

  async confirmTokenAccess(req, res) {
    const { access_token, email } = req.body;
    if (!access_token || !email)
      throw new NotFoundException("Token or email is missing.");

    const tokenValid = await userServices.confirmTokenAccess(
      access_token,
      email
    );

    if (!tokenValid)
      throw new UnauthorizedException(
        "Your link is invalid, please try again."
      );

    return res.status(200).json({
      message: "Confirm Success!",
      user: tokenValid.username,
    });
  }

  initController() {
    const prefix = this._rootPath;
    const routes = [
      {
        method: "get",
        path: "/getProfile",
        middlewares: [AuthMiddleware /*, AdminMiddleware*/],
        handler: this.getProfile,
      },
      {
        method: "post",
        path: "/confirmSignup",
        handler: this.confirmSignup,
      },
      {
        method: "post",
        path: "/login",
        middlewares: [this.validateBeforeLogin],
        handler: this.login,
      },
      {
        method: "post",
        path: "/register",
        middlewares: [this.validateBeforeRegister],
        handler: this.register,
      },
      {
        method: "post",
        path: "/confirm-token-access",
        handler: this.confirmTokenAccess,
      },
      {
        method: "post",
        path: "/sendEmailResetPassword",
        handler: this.sendEmailResetPass,
      },
      {
        method: "post",
        path: "/confirm-new-password",
        handler: this.confirmNewPassword,
      },
    ];

    routes.forEach(({ method, path, middlewares = [], handler }) => {
      this._router[method](
        `${prefix}${path}`,
        ...middlewares.map((m) => m.bind?.(this) || m),
        asyncHandler(handler.bind(this))
      );
    });
  }
}

module.exports = AuthController;
