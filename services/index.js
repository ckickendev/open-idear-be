const userService = require("./user.services");
const authService = require("./auth.services");
const categorieService = require("./category.services");
const commentService = require("./comment.services");
const likeService = require("./like.services");
const postService = require("./post.services");
const mediaService = require("./media.services");
const subService = require("./sub.services");
const tagService = require("./tag.services");
const notificationService = require("./notification.services");

module.exports = {
  userService,
  authService,
  categorieService,
  commentService,
  likeService,
  postService,
  mediaService,
  subService,
  tagService,
  notificationService,
};
