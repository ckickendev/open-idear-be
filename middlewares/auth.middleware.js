const jwt = require("jsonwebtoken");
require("dotenv").config();
const { NotFoundException, UnauthorizedException } = require("../exceptions");
const { User } = require("../models");

async function _verifyToken(req) {
  const headersToken = req?.headers["authorization"];
  if (!headersToken) {
    throw new UnauthorizedException("No token provided");
  }
  const tokenClient = headersToken.split(" ")[1];
  if (!tokenClient) {
    throw new UnauthorizedException("Invalid token format");
  }
  const validToken = jwt.verify(tokenClient, process.env.SECRET_KEY || "SECRET_KEY", {
    algorithms: ["HS256"],
  });
  const checkingUser = await User.findOne({ email: validToken.email }).select('_id role email username activate');
  if (!checkingUser) {
    throw new NotFoundException("User not found!");
  }
  return checkingUser;
}

async function AuthMiddleware(req, res, next) {
  try {
    const user = await _verifyToken(req);
    req.userInfo = {
      _id: user._id,
    };
    next();
  } catch (error) {
    res.status(403).send({ error: error.message || "Invalid Token" });
  }
}

async function AdminMiddleware(req, res, next) {
  try {
    const user = await _verifyToken(req);
    if (user.role !== 1) {
      return next(new UnauthorizedException("User is not admin!"));
    }
    req.userInfo = user;
    next();
  } catch (error) {
    res.status(403).send({ error: error.message || "Invalid Token" });
  }
}

async function LoginMiddleware(req, res, next) {
  try {
    const user = await _verifyToken(req);
    req.userInfo = user;
    next();
  } catch (error) {
    res.status(403).send({ error: error.message || "Please re-login" });
  }
}

async function OptionalAuthMiddleware(req, res, next) {
  try {
    const headersToken = req?.headers["authorization"];
    if (!headersToken) return next();

    const tokenClient = headersToken.split(" ")[1];
    if (!tokenClient) return next();

    const validToken = jwt.verify(tokenClient, process.env.SECRET_KEY || "SECRET_KEY", {
      algorithms: ["HS256"],
    });
    const checkingUser = await User.findOne({ email: validToken.email }).select('_id role email username activate');
    if (checkingUser) {
      req.userInfo = { _id: checkingUser._id };
    }
    next();
  } catch (error) {
    next();
  }
}

module.exports = { AuthMiddleware, AdminMiddleware, LoginMiddleware, OptionalAuthMiddleware };

