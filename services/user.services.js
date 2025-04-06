const { Service, ConsoleLogger } = require("../core");
const { User } = require("../models");
const { makeRandomNumber, makeRandomString } = require("../utils/function");
const { ServerException, ForbiddenException } = require("../exceptions");
const sendEmailHandler = require("../utils/sendEmailOptions");
const { confirmTokenEmail, confirmResetPass } = require("../utils/emailTemplate");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const sendEmailHandlerEnhance = require("../utils/sendEmailOptions");
class UserService extends Service {
  async getAllUser() {
    const users = await User.find({});
    return users;
  }

  async register(email, username, password) {
    try {
      const numberTokenGenerate = makeRandomNumber(6);
      const randomLink =
        process.env.ROOT_FRONTEND +
        "/authen/confirm_register?link=" +
        makeRandomString(100) +
        "&access_token=" +
        numberTokenGenerate +
        "&email=" +
        email;
      const passwordEncrypt = await bcrypt.hash(password, 10);
      ConsoleLogger.info(email)
      const isSendEmailSuccess = await sendEmailHandlerEnhance({
        to: email,
        subject: "Please enter this code to confirm register account",
        html: confirmTokenEmail(numberTokenGenerate, randomLink),
      });
      if (isSendEmailSuccess) {
        const newUser = new User({
          _id: new mongoose.Types.ObjectId(),
          username: username,
          password: passwordEncrypt,
          email: email,
          activate: false,
          activate_code: numberTokenGenerate,
        });
        newUser.save();
      } else {
        throw new ServerException("Cannot send email");
      }

    } catch (e) {
      throw new ServerException("Error", e.message);
    }
  }

  async sendEmailResetPass(email) {
    const tokenGenerate = makeRandomString(50);
    const linkResetPassword =
      process.env.ROOT_FRONTEND +
      "/authen/reset-password-link?token_access=" +
      tokenGenerate +
      "&email=" +
      email;
    try {
      await sendEmailHandler({
        to: email,
        subject: "Your link to reset your password",
        html: confirmResetPass(linkResetPassword),
        GOOGLE_MAILER_CLIENT_ID: process.env.GOOGLE_MAILER_CLIENT_ID,
        GOOGLE_MAILER_CLIENT_SECRET: process.env.GOOGLE_MAILER_CLIENT_SECRET,
        GOOGLE_MAILER_REFRESH_TOKEN: process.env.GOOGLE_MAILER_REFRESH_TOKEN,
      });

      const userUpdate = await User.findOne({ email: email });
      userUpdate.token_reset_pass = tokenGenerate;
      // set minute

      userUpdate.token_reset_pass_expired = Date.now() + 30*60*1000
      userUpdate.save();
    } catch (e) {
      throw new ServerException("Error", e.message);
    }
  }

  findUserByAccount = async (account) => {
    const user = await User.findOne({ $or: [{ email: account }, { username: account }] });
    if (user) {
      return user;
    }
    return null;
  }

  async confirmToken(token, email) {
    // 0 => not authen, 1: ok, 2=> already
    const user = await User.findOne({ email: email });
    if (user.activate) {
      return 2;
    }
    if (user.activate_code == token) {
      user.activate = true;
      user.activate_code = "";
      await user.save();
      return 1;
    }
    return 0;
  }

  async confirmTokenAccess(access_token, email) {
    const user = await User.findOne({ email: email });
    console.log(access_token);

    console.log(user.token_reset_pass);
    

    if(user.token_reset_pass === access_token) {
      
      if(user.token_reset_pass_expired <= Date.now()) { 
        throw new ServerException("Your token is expired")
      } else {
        return true;
      }
    } else {
      return false;
    }

  }

  async confirmNewPassword(access_token, new_password) {
    const user = await User.findOne({ token_reset_pass: access_token });
    const newPassword = await bcrypt.hash(new_password, 10);
    user.password = newPassword;
    user.token_reset_pass = "";
    user.save();
  }
}

module.exports = new UserService();
