const { Service, ConsoleLogger } = require("../core");
const { User } = require("../models");
const { makeRandomNumber, makeRandomString, makeRandomAvatar } = require("../utils/function");
const { ServerException, ForbiddenException, UnauthorizedException, NotFoundException } = require("../exceptions");
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
          name: username,
          username: username,
          password: passwordEncrypt,
          email: email,
          activate: false,
          activate_code: numberTokenGenerate,
          avatar: makeRandomAvatar(),
          background: "https://codetheweb.blog/assets/img/posts/css-advanced-background-images/cover.jpg",
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

      userUpdate.token_reset_pass_expired = Date.now() + 30 * 60 * 1000
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

  async findUserById(id) {
    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
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
    if (user.token_reset_pass === access_token) {
      if (user.token_reset_pass_expired <= Date.now()) {
        throw new ServerException("Your token is expired")
      } else {
        return user;
      }
    } else {
      return false;
    }

  }

  async confirmNewPassword(emailSent, password) {
    const user = await User.findOne({ email: emailSent });
    const newPassword = await bcrypt.hash(password, 10);
    if (user) {
      user.password = newPassword;
      user.token_reset_pass = "";
      user.token_reset_pass_expired = ""
      await user.save();
    } else {
      throw new NotFoundException("Cannot find your username");
    }
  }

  async updateAvatar(avatar, _id) {
    const user = await User.findById(_id);
    if (user) {
      user.avatar = avatar;
      await user.save();
    } else {
      throw new NotFoundException("Cannot find your user");
    }
  }

  async updateBackground(background, _id) {
    const user = await User.findById(_id);
    if (user) {
      user.background = background;
      await user.save();
    } else {
      throw new NotFoundException("Cannot find your user");
    }
  }

  async updateProfile(name, bio, _id) {
    const user = await User.findById(_id);
    if (user) {
      user.name = name;
      user.bio = bio;
      await user.save();
    } else {
      throw new NotFoundException("Cannot find your user");
    }
  }

  async isFollowed(userId, authorId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if(!user.followers) {
      return false
    }
    return user.followers.includes(authorId);
  }

  async followUser(userId, authorId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if (user.followers.includes(authorId)) {
      // Unfollow the author
      user.followers = user.followers.filter(follower => follower.toString() !== authorId.toString());
    }
    else {
      // Follow the author
      user.followers.push(authorId);
    }
    await user.save();
    return user.followers.includes(authorId);
  }
}

module.exports = new UserService();
