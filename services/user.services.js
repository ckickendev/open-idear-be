const { Service } = require("../core");
const { User } = require("../models");
const { makeRandomNumber, makeRandomString } = require("../utils/function");
const { ServerException, ForbiddenException } = require("../exceptions");
const sendEmailHandler = require("../utils/sendEmailOptions");
const { confirmTokenEmail, confirmRegiter } = require("../utils/emailTemplate");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
class UserService extends Service {
  async getAllUser() {
    const users = await User.find({});
    return users;
  }

  async register(email, password) {
    try {
      const numberTokenGenerate = makeRandomNumber(6);
      const randomLink =
        process.env.ROOT_FRONTEND +
        "/confirm_register?link=" +
        makeRandomString(100) +
        "&access_token=" +
        numberTokenGenerate +
        "&email=" +
        email;
      const passwordEncrypt = await bcrypt.hash(password, 10);

      await sendEmailHandler({
        to: email,
        subject: "Please enter this code to confirm register account",
        html: confirmTokenEmail(numberTokenGenerate, randomLink),
        GOOGLE_MAILER_CLIENT_ID: process.env.GOOGLE_MAILER_CLIENT_ID,
        GOOGLE_MAILER_CLIENT_SECRET: process.env.GOOGLE_MAILER_CLIENT_SECRET,
        GOOGLE_MAILER_REFRESH_TOKEN: process.env.GOOGLE_MAILER_REFRESH_TOKEN,
      });
      const newUser = new User({
        _id: new mongoose.Types.ObjectId(),
        username: email,
        password: passwordEncrypt,
        email: email,
        activate: false,
        activate_code: numberTokenGenerate,
      });
      newUser.save();
    } catch (e) {
      throw new ServerException("Error", e.message);
    }
  }

  async resetpassword(email) {
    const tokenGenerate = makeRandomString(50);
    const linkResetPassword =
      process.env.ROOT_FRONTEND +
      "/reset-password-link?token_access=" +
      tokenGenerate;
    try {
      await sendEmailHandler({
        to: email,
        subject: "Your link to reset your password",
        html: confirmRegiter(linkResetPassword),
        GOOGLE_MAILER_CLIENT_ID: process.env.GOOGLE_MAILER_CLIENT_ID,
        GOOGLE_MAILER_CLIENT_SECRET: process.env.GOOGLE_MAILER_CLIENT_SECRET,
        GOOGLE_MAILER_REFRESH_TOKEN: process.env.GOOGLE_MAILER_REFRESH_TOKEN,
      });
      
      const userUpdate = await User.findOne({ email: email });
      userUpdate.token_reset_pass = tokenGenerate;
      userUpdate.save();
    } catch (e) {
      throw new ServerException("Error", e.message);
    }
  }

  async confirmToken(token, email) {
    const user = await User.findOne({ email: email });
    if (user.activate) {
      throw new ForbiddenException(
        "Your account (" +
          email +
          ") is activated before, return to login now !"
      );
    }
    if (user.activate_code == token) {
      user.activate = true;
      user.activate_code = "";
      await user.save();
      return true;
    }
    return false;
  }

  async confirmTokenAccess(access_token) {
    const user = await User.findOne({ token_reset_pass: access_token });
    if (user.id) {
      return true;
    }
    return false;
  }

  async confirmNewPassword(access_token, new_password) {
    const user = await User.findOne({token_reset_pass: access_token});
    const newPassword = await bcrypt.hash(new_password, 10);
    user.password = newPassword;
    user.token_reset_pass = "";
    user.save();
  }
}

module.exports = new UserService();
