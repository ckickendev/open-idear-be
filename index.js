const {
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
  CourseController,
  SeriesController
} = require("./controllers/index.js");
const AppServer = require("./functions/appServer");

const app = new AppServer([
  new UserController(),
  new CategoryController(),
  new CommentController(),
  new LikeController(),
  new PostController(),
  new MediaController(),
  new NotificationController(),
  new SeriesController(),
  new SubController(),
  new TagController(),
  new AuthController(),
  new CourseController(),
]);

app.startListening();
