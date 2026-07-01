const userService = require("./user.services");
const authService = require("./auth.services");
const categorieService = require("./category.services");
const commentService = require("./comment.services");
const likeService = require("./like.services");
const postService = require("./post.services");
const mediaService = require("./media.services");
const subService = require("./sub.services");
const seriesService = require("./series.services");
const tagService = require("./tag.services");
const notificationService = require("./notification.services");
const courseService = require("./course.services");
const topicService = require("./topic.services");
const cartService = require("./cart.services");
const paymentService = require("./payment.services");
const enrollmentService = require("./enrollment.services");
const uploadService = require("./upload.services");
const mediaAssetService = require("./mediaAsset.services");
const mediaFolderService = require("./mediaFolder.services");
const aiQueueService = require("./aiQueue.services");
const aiAnalysisService = require("./aiAnalysis.services");
const aiWorker = require("./aiWorker");
const aiSuggestionService = require("./aiSuggestion.services");
const unifiedSearchService = require("./unifiedSearch.services");
const aiSemanticSearchService = require("./aiSemanticSearch.services");
const externalMediaCacheService = require("./externalMediaCache.services");
const ocrService = require("./ocr.services");
const duplicateDetectionService = require("./duplicateDetection.services");

module.exports = {
  userService,
  authService,
  categorieService,
  commentService,
  likeService,
  postService,
  mediaService,
  subService,
  seriesService,
  tagService,
  notificationService,
  courseService,
  topicService,
  cartService,
  paymentService,
  enrollmentService,
  uploadService,
  mediaAssetService,
  mediaFolderService,
  aiQueueService,
  aiAnalysisService,
  aiWorker,
  aiSuggestionService,
  unifiedSearchService,
  aiSemanticSearchService,
  externalMediaCacheService,
  ocrService,
  duplicateDetectionService,
};
