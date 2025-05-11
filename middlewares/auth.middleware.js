const jwt = require("jsonwebtoken");
require("dotenv").config();
const { NotFoundException, UnauthorizedException } = require("../exceptions");
const { User } = require("../models");

async function AuthMiddleware(req, res, next) {
  try {
    console.log("AuthMiddleware", req.headers["authorization"]);
    const headersToken =
      req?.headers["authorization"] || req?.body?.headers["Authorization"];
    const tokenClient = headersToken.split(" ")[1];
    const validToken = jwt.verify(tokenClient, "SECRET_KEY", {
      algorithms: ["HS256"],
    });
    const checkingUser = await User.findOne({ email: validToken.email });
    if (!checkingUser) {
      return next(new NotFoundException("User not found!"));
    }
    req.userInfo = {
      _id: checkingUser._id,
    };
    next();
  } catch (error) {
    res.status(403).send({ error: error.message || "Invalid Token" });
  }
}

async function AdminMiddleware(req, res, next) {
  try {
    const headersToken =
      req?.headers["authorization"] || req?.body?.headers["Authorization"];
    const tokenClient = headersToken.split(" ")[1];
    const validToken = jwt.verify(tokenClient, "SECRET_KEY", {
      algorithms: ["HS256"],
    });
    const checkingUser = await User.findOne({ email: validToken.email });
    if (!checkingUser) {
      return next(new NotFoundException("User not found!"));
    }
    if (checkingUser.role !== 1) {
      return next(new UnauthorizedException("User is not admin!"));
    }
    req.userInfo = checkingUser;
    next();
  } catch (error) {
    res.status(403).send({ error: error.message || "Invalid Token" });
  }
}

module.exports = { AuthMiddleware, AdminMiddleware };
