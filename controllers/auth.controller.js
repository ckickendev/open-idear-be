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

class AuthController extends Controller {
  _rootPath = "/auth";
  _router = express.Router();
  constructor() {
    super();
    this.initController();
  }

  async login(req, res, next) {
    try {
      const { email, _id, role } = req.user;
      const payload = {
        id: _id,
        email,
        role
      };
      console.log(payload);

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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async register(req, res, next) {
    const { email, username, password } = req.body;
    try {
      await userServices.register(email, username, password,);
      return res.status(200).json({
        message: "Register Success",
        user: email,
      });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  async getProfile(req, res, next) {
    try {
      const userId = req.userInfo._id;
      const userInfo = await userServices.findUserById(userId);
      if (!userInfo) {
        throw new NotFoundException("User not found !");
      }
      const userFilter = {
        _id: userInfo._id,
        username: userInfo.username,
        email: userInfo.email,
        role: userInfo.role,
        activate: userInfo.activate,
        createdAt: userInfo.createdAt,
        bio: userInfo.bio,
        avatar: userInfo.avatar,
        background: userInfo.background,
      }

      return res.status(200).json({
        message: "success",
        userInfo: userFilter,
      });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }

  async validateBeforeLogin(req, res, next) {
    console.log(req.body);

    try {
      const { account, password } = req.body;

      const user = await User.findOne({
        $or: [
          { email: account },
          { username: account }
        ]
      })
      if (!user) {
        throw new NotFoundException("User not found");
      }
      const isPasswordTrue = await bcrypt.compare(password, user.password);
      if (!isPasswordTrue) {
        throw new BadRequestException("Password incorrect ! Please try again");
      }
      if (!user.activate) {
        throw new ForbiddenException(
          "Your account is not activate, please check your mail to activate your account!"
        );
      }
      req.user = user;
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async validateBeforeRegister(req, res, next) {
    let errorMessage = "Some Error is occurs";
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email });
      if (user) {
        errorMessage = "User exist";
        throw ServerException("User exist");
      }
      next();
    } catch (err) {
      res.status(500).json({ error: errorMessage });
    }
  }

  async confirmSignup(req, res) {
    const info_access = req.body;
    if (!info_access.token || !info_access.user_authen) {
      res.status(500).json({ error: "Some error occurs, please try again" });
    }
    try {
      const { token, user_authen } = req.body;
      const confirmToken = await userServices.confirmToken(token, user_authen);
      if (confirmToken === 1) {
        res
          .status(200)
          .json({ message: "Your account is register successfully, you will redirect to login !", user: user_authen });
      } else if (confirmToken === 0) {
        res
          .status(500)
          .json({ error: "Your code/link is not match, please check again" });
      } else {
        res.
          status(200)
          .json({ message: `Your account (${user_authen} is already activated, you will redirect to login)`, user: user_authen });
      }
    } catch (err) {
      console.log(err);

      res.status(500).json({ error: err.message });
    }
  }

  sendEmailResetPass = async (req, res, next) => {
    try {
      const account = req.body.account;
      const user = await userServices.findUserByAccount(account);
      if (!user) {
        throw new ServerException("Cannot find user ! Please try again");
      }

      await userServices.sendEmailResetPass(user.email);
      return res.status(200).json({
        status: 200,
        email: user.email.replace(/(.{3}).*(@.*)/, '$1***$2'),
        message: "Email sent,please check your email !",
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Some errors is occurs, please check again " });
    }
  };

  confirmNewPassword = async (req, res, next) => {
    try {
      console.log(req.body);

      const { emailSent, password } = req.body;
      await userServices.confirmNewPassword(emailSent, password);
      return res.status(200).json({
        message:
          "Password changed, please return to homepage and check again !",
      });
    } catch (err) {
      return res
        .status(500)
        .json({ error: err.message || "Some error is occurs" });
    }
  };

  confirmTokenAccess = async (req, res, next) => {
    try {
      const { access_token, email } = req.body;
      if (!access_token || !email) {
        throw new NotFoundException("Your token is invalid");
      }
      const isExistToken = await userServices.confirmTokenAccess(access_token, email);
      if (isExistToken) {
        return res.status(200).json({
          message: "Confirm Success !",
          user: isExistToken.username
        });
      } else {
        throw new UnauthorizedException(
          "Your link is invalid, please try again! "
        );
      }
    } catch (err) {
      return res
        .status(500)
        .json({ error: err.message || "Some error is occurs" });
    }
  };

  initController() {
    this._router.get(`${this._rootPath}/getProfile`, AuthMiddleware, this.getProfile);
    this._router.post(`${this._rootPath}/confirmSignup`, this.confirmSignup);
    this._router.post(
      `${this._rootPath}/login`,
      this.validateBeforeLogin,
      this.login
    );
    this._router.post(
      `${this._rootPath}/register`,
      this.validateBeforeRegister,
      this.register
    );
    this._router.post(
      `${this._rootPath}/confirm-token-access`,
      this.confirmTokenAccess
    );
    this._router.post(`${this._rootPath}/sendEmailResetPassword`, this.sendEmailResetPass);
    this._router.post(
      `${this._rootPath}/confirm-new-password`,
      this.confirmNewPassword
    );
  }
}

module.exports = AuthController;
