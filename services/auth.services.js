const { Service } = require("../core");
const jwt = require("jsonwebtoken");
require("dotenv").config();

class AuthService extends Service {
  async generateToken(data) {
    return await jwt.sign(data, process.env.SECRET_KEY, {
      algorithm: "HS256",
      expiresIn: process.env.JWT_EXPIRED,
    });
  }

  async generateRefreshToken(data) {
    return await jwt.sign(data, process.env.SECRET_KEY, {
      algorithm: "HS256",
      expiresIn: process.env.JWT_REFRESH_EXPIRED,
    });
  }
}

module.exports = new AuthService();
