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
    const { email, password } = req.body;
    try {
      ConsoleLogger.info("come 1")
      await userServices.register(email, password);
      ConsoleLogger.info("come 2")
      return res.status(200).json({
        message: "Create Success",
        user: email,
      });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  async WhoAmI(req, res, next) {
    const userInfo = req.userInfo;
    try {
      return res.status(200).json({
        message: "success",
        userInfo: userInfo,
      });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }

  async validateBeforeLogin(req, res, next) {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email });
      if (!user) {
        throw new NotFoundException("User not found");
      }
      const isPasswordTrue = await bcrypt.compare(password, user.password);
      if (!isPasswordTrue) {
        throw new BadRequestException("Password not matching!");
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
      if (confirmToken) {
        res
          .status(200)
          .json({ message: "Confirm Success !", user: user_authen });
      } else {
        res
          .status(500)
          .json({ error: "Your code/link is not match, please check again" });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  resetPass = async (req, res, next) => {
    try {
      const email = req.body.email;
      await userServices.resetpassword(email);
      return res.status(200).json({
        status: 200,
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
      const { access_token, new_password } = req.body;
      await userServices.confirmNewPassword(access_token, new_password);
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
      const { access_token } = req.body;
      if (!access_token) {
        throw new NotFoundException("Your token is invalid");
      }
      const isExistToken = await userServices.confirmTokenAccess(access_token);
      if (isExistToken) {
        return res.status(200).json({
          message: "Confirm Success !",
        });
      } else {
        throw new UnauthorizedException(
          "Your link is invalid or expired, please try again! "
        );
      }
    } catch (err) {
      return res
        .status(500)
        .json({ error: err.message || "Some error is occurs" });
    }
  };

  initController() {
    this._router.get(`${this._rootPath}/whoAmI`, AuthMiddleware, this.WhoAmI);
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
    this._router.post(`${this._rootPath}/resetpassword`, this.resetPass);
    this._router.post(
      `${this._rootPath}/confirm-new-password`,
      this.confirmNewPassword
    );
  }
}

module.exports = AuthController;
