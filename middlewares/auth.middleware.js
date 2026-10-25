const jwt = require("jsonwebtoken");
require("dotenv").config();
const { NotFoundException, UnauthorizedException } = require("../exceptions");
const { User } = require("../models");

function _extractToken(req) {
  const headersToken = req?.headers["authorization"];
  if (headersToken) {
    const token = headersToken.split(" ")[1];
    if (token) return token;
  }
  // Fallback: check cookie header (e.g. access_token or token)
  const cookieHeader = req?.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)(?:access_token|token)=([^;]*)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

async function _verifyToken(req) {
  const tokenClient = _extractToken(req);
  if (!tokenClient) {
    throw new UnauthorizedException("No token provided");
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

function isAdminUser(user) {
  if (!user) return false;
  const role = user.role;
  return role === 1 || role === "1" || role === "admin";
}

async function AdminMiddleware(req, res, next) {
  try {
    const user = await _verifyToken(req);
    if (!isAdminUser(user)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Admin access required",
      });
    }
    if (user.activate === false) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Account is deactivated or locked",
      });
    }
    req.userInfo = user;
    next();
  } catch (error) {
    const status = error.status || 401;
    res.status(status).json({ success: false, message: error.message || "Invalid Token" });
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
    const tokenClient = _extractToken(req);
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

module.exports = { AuthMiddleware, AdminMiddleware, LoginMiddleware, OptionalAuthMiddleware, isAdminUser };

