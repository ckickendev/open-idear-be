require("ts-node/register");
require("dotenv").config();

// Process-level anti-crash handlers: prevent unhandled stream/socket errors from terminating the backend
process.on("unhandledRejection", (reason, promise) => {
  console.error("[AntiCrash] Intercepted unhandledRejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[AntiCrash] Intercepted uncaughtException:", error);
});

const { providerRegistry, GeminiProvider } = require("./ai");
const geminiApiKey = (process.env.GEMINI_API_KEY || process.env["GEMINI_API_KEY "] || "").trim();
if (geminiApiKey) {
  providerRegistry.register(new GeminiProvider(geminiApiKey));
}

// Fail-fast environment variable validation for production readiness
const requiredEnvVars = ["MONGO_URL", "CORS_ALLOW_ORIGINS", "SECRET_KEY"];
const missingEnv = requiredEnvVars.filter((v) => !process.env[v]);
if (missingEnv.length > 0) {
  console.error(`[CRITICAL] Missing required environment variables: ${missingEnv.join(", ")}`);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
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
  SmartPublishController,
  CourseIntelligenceController,
  MasteryController,
  AIUsageController,
  ArticleController,
  ReadingProgressController,
  CollectionController,
  HealthController,
  ShopCategoryController,
  ShopProductController,
  ShopOrderController,
  ShopAnalyticsController,
} = require("./controllers/index.js");

const AppServer = require("./functions/appServer");

const app = new AppServer([
  new HealthController(),
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
  new SmartPublishController(),
  new CourseIntelligenceController(),
  new MasteryController(),
  new AIUsageController(),
  new ArticleController(),
  new ReadingProgressController(),
  new CollectionController(),
  new ShopCategoryController(),
  new ShopProductController(),
  new ShopOrderController(),
  new ShopAnalyticsController(),
]);

app.startListening();

// Start background AI metadata generation worker daemon
const { aiWorker } = require("./services");
aiWorker.start();
// trigger restart nodemon clean - content studio loaded successfully


