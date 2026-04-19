const { Service, ConsoleLogger } = require("../core");
const { User } = require("../models");
const { makeRandomNumber, makeRandomString, makeRandomAvatar } = require("../utils/function");
const { ServerException, ForbiddenException, UnauthorizedException, NotFoundException } = require("../exceptions");
const sendEmailHandler = require("../utils/sendEmailOptions");
const { confirmTokenEmail, confirmResetPass } = require("../utils/emailTemplate");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
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
      const isSendEmailSuccess = await sendEmailHandler({
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
        await newUser.save();
      } else {
        throw new ServerException("Cannot send email");
      }

    } catch (e) {
      throw new ServerException(e.message || "Error during registration");
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
      if (!userUpdate) throw new NotFoundException("User not found");
      userUpdate.token_reset_pass = tokenGenerate;
      userUpdate.token_reset_pass_expired = Date.now() + 30 * 60 * 1000
      await userUpdate.save();
    } catch (e) {
      throw new ServerException(e.message || "Error during password reset email");
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

  async findUserByUsername(username) {
    const user = await User.findOne({ username: username.toLowerCase() })
      .select("-password -activate_code -token_reset_pass -token_reset_pass_expired -del_flag");
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async confirmToken(token, email) {
    const user = await User.findOne({ email });
    if (!user) throw new NotFoundException("User not found");

    if (user.activate) {
      return { status: "ALREADY_ACTIVATED", code: 2 };
    }
    if (user.activate_code === token) {
      user.activate = true;
      user.activate_code = "";
      await user.save();
      return { status: "SUCCESS", code: 1 };
    }
    return { status: "INVALID_TOKEN", code: 0 };
  }

  async confirmTokenAccess(access_token, email) {
    const user = await User.findOne({ email });
    if (!user) throw new NotFoundException("User not found");

    if (user.token_reset_pass === access_token) {
      if (user.token_reset_pass_expired <= Date.now()) {
        throw new ServerException("Your token is expired")
      }
      return user;
    }
    return false;
  }

  async confirmNewPassword(emailSent, password) {
    const user = await User.findOne({ email: emailSent });
    if (!user) throw new NotFoundException("Cannot find your user");

    const newPassword = await bcrypt.hash(password, 10);
    user.password = newPassword;
    user.token_reset_pass = "";
    user.token_reset_pass_expired = null;
    await user.save();
  }

  async updateUser(userId, updates) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  // Deprecated: keeping for backward compatibility if needed by other services, but should use updateUser
  async updateAvatar(avatar, _id) {
    return this.updateUser(_id, { avatar });
  }

  async updateBackground(background, _id) {
    return this.updateUser(_id, { background });
  }

  async updateProfile(name, bio, _id) {
    return this.updateUser(_id, { name, bio });
  }

  async isFollowed(userId, authorId) {
    if (userId.toString() === authorId.toString()) {
      return null;
    }
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user.followers ? user.followers.some(f => f.toString() === authorId.toString()) : false;
  }

  async followUser(userId, authorId) {
    if (userId.toString() === authorId.toString()) {
      throw new ServerException("You cannot follow yourself");
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundException("User not found");

    const isFollowing = user.followers.some(f => f.toString() === authorId.toString());

    if (isFollowing) {
      await User.findByIdAndUpdate(userId, { $pull: { followers: authorId } });
      return false;
    } else {
      await User.findByIdAndUpdate(userId, { $addToSet: { followers: authorId } });
      return true;
    }
  }
  async deleteUser(userId) {
    const user = await User.findByIdAndUpdate(userId, { del_flag: 1 }, { new: true });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async toggleUserStatus(userId) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundException("User not found");
    user.activate = !user.activate;
    await user.save();
    return user;
  }

  async createUser(data) {
    const { email, username, name, password, role } = data;
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) throw new ServerException("User with this email or username already exists");

    const passwordEncrypt = await bcrypt.hash(password || "defaultpassword", 10);
    const newUser = new User({
      _id: new mongoose.Types.ObjectId(),
      name: name || username,
      username: username,
      password: passwordEncrypt,
      email: email,
      role: role !== undefined ? role : 0,
      activate: true,
      avatar: makeRandomAvatar(),
      background: "https://codetheweb.blog/assets/img/posts/css-advanced-background-images/cover.jpg",
    });
    await newUser.save();
    return newUser;
  }
}

module.exports = new UserService();
