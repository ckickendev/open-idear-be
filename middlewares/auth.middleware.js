const jwt = require("jsonwebtoken");
require("dotenv").config();
const { NotFoundException, UnauthorizedException } = require("../exceptions");
const { User } = require("../models");

async function AuthMiddleware(req, res, next) {
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
    req.userInfo = {
      _id: checkingUser._id,
    };
    console.log("AuthMiddleware userInfo:", req.userInfo);
    
    next();
  } catch (error) {
    console.error("AuthMiddleware error:", error);
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

async function LoginMiddleware(req, res, next) {
  try {
    const headersToken =
      req?.headers["authorization"] || req?.body?.headers["Authorization"];
    const tokenClient = headersToken.split(" ")[1];
    const validToken = jwt.verify(tokenClient, "SECRET_KEY", {
      algorithms: ["HS256"],
    });
    if (!validToken) {
      return next(new UnauthorizedException("Please login!"));
    }
    const checkingUser = await User.findOne({ email: validToken.email });
    if (!checkingUser) {
      return next(new NotFoundException("User not found!"));
    }
    req.userInfo = checkingUser;
    next();
  } catch (error) {
    res.status(403).send({ error: error.message || "Please re-login" });
  }
}

// Like AuthMiddleware but does NOT block unauthenticated requests.
// Sets req.userInfo if a valid token is present, otherwise continues silently.
async function OptionalAuthMiddleware(req, res, next) {
  try {
    const headersToken =
      req?.headers["authorization"] || req?.body?.headers?.["Authorization"];
    if (!headersToken) return next();

    const tokenClient = headersToken.split(" ")[1];
    if (!tokenClient) return next();

    const validToken = jwt.verify(tokenClient, "SECRET_KEY", {
      algorithms: ["HS256"],
    });
    const checkingUser = await User.findOne({ email: validToken.email });
    if (checkingUser) {
      req.userInfo = { _id: checkingUser._id };
    }
    next();
  } catch (error) {
    // Token invalid or expired — continue without auth
    next();
  }
}

module.exports = { AuthMiddleware, AdminMiddleware, LoginMiddleware, OptionalAuthMiddleware };
