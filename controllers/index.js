const AuthController = require("./auth.controller");
const CategoryController = require("./category.controller");
const CommentController = require("./comment.controller");
const LikeController = require("./like.controller");
const PostController = require("./post.controller");
const MediaController = require("./media.controller");
const NotificationController = require("./notification.controller");
const SubController = require("./sub.controller");
const TagController = require("./tag.controller");
const UserController = require("./user.controller");

module.exports = {
  UserController,
  CategoryController,
  CommentController,
  LikeController,
  PostController,
  MediaController,
  NotificationController,
  SubController,
  TagController,
  AuthController,
};
