require("ts-node/register");
require("dotenv").config();

const { providerRegistry, GeminiProvider } = require("./ai");
if (process.env.GEMINI_API_KEY) {
  providerRegistry.register(new GeminiProvider(process.env.GEMINI_API_KEY.trim()));
}

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
  SeriesController,
  TopicController,
  CartController,
  PaymentController,
  EnrollmentController,
  SupportTicketController,
  ContributionController,
  MediaAssetController,
  AIController,
  AssetController,
  EditorController,
  PublishingController,
  GrowthController,
  CourseCategoryController,
  CourseIntelligenceController,
  MasteryController,
  AIUsageController,
  ArticleController,
  ReadingProgressController,
  CollectionController,
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
  new TopicController(),
  new CartController(),
  new PaymentController(),
  new EnrollmentController(),
  new SupportTicketController(),
  new ContributionController(),
  new MediaAssetController(),
  new AIController(),
  new AssetController(),
  new EditorController(),
  new PublishingController(),
  new GrowthController(),
  new CourseCategoryController(),
  new CourseIntelligenceController(),
  new MasteryController(),
  new AIUsageController(),
  new ArticleController(),
  new ReadingProgressController(),
  new CollectionController(),
]);

app.startListening();

// Start background AI metadata generation worker daemon
const { aiWorker } = require("./services");
aiWorker.start();
// trigger restart nodemon clean - updated writer prompt maxTokens & streamArticle


