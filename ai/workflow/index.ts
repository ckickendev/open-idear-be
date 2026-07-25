// =============================================================================
//  AI WORKFLOW — PUBLIC BARREL
//  ai/workflow/index.ts
//
//  Standardized entry point for the sequential Agent workflow engine.
// =============================================================================

export {
  type WorkflowStage,
} from "./types";

export {
  Workflow,
} from "./executor";

export {
  CreateArticlePlanningWorkflow,
} from "./articlePlanning.workflow";

export {
  AssetUploadWorkflow,
  type AssetUploadInput,
} from "./assetUpload.workflow";

export {
  CreateArticleWorkflow,
} from "./createArticle.workflow";

export {
  EditingWorkflow,
  type EditingWorkflowInput,
} from "./editing.workflow";

export {
  publishTaskRegistry,
  PublishTaskRegistry,
  type PublishTask,
  type PublishTaskResult,
  type PublishTaskContext,
} from "./publishTask.registry";

export {
  MetadataResultSchema,
  type MetadataResult,
  ReviewResultSchema,
  type ReviewResult,
  SEOResultSchema,
  type SEOResult,
  CategoryResultSchema,
  type CategoryResult,
} from "./publishTask.schema";

export {
  PublishingEngine,
  publishingEngine,
} from "./publishingEngine";

export {
  PublishingWorkflow,
  type PublishingWorkflowInput,
  type PublishPreflightReport,
} from "./publishing.workflow";

export {
  growthTaskRegistry,
  GrowthTaskRegistry,
  type GrowthTask,
  type GrowthTaskResult,
  type GrowthTaskContext,
} from "./growthTask.registry";

export {
  FAQResultSchema,
  type FAQResult,
  InternalLinkResultSchema,
  type InternalLinkResult,
  ComparisonTableResultSchema,
  type ComparisonTableResult,
  SocialPostResultSchema,
  type SocialPostResult,
  AffiliateResultSchema,
  type AffiliateResult,
  ContentGapResultSchema,
  type ContentGapResult,
} from "./growthTask.schema";

export {
  GrowthEngine,
  growthEngine,
} from "./growthEngine";

export {
  GrowthWorkflow,
  type GrowthWorkflowInput,
} from "./growth.workflow";

export {
  tutorialWorkflow,
  affiliateWorkflow,
  newsWorkflow,
  comparisonWorkflow,
} from "./orchestratedWorkflows";

export {
  publishChecklistRegistry,
  PublishChecklistRegistry,
  type ChecklistItemResult,
  type PublishChecklistRule,
} from "./publishChecklist";

export {
  publishingScheduler,
  PublishingScheduler,
  type PublishingStatus,
  type PublishingState,
  type PublishTransitionPayload,
} from "./publishingScheduler";

export {
  versionHistoryManager,
  VersionHistoryManager,
  type VersionType,
  type VersionEntry,
} from "./versionHistory";

export {
  postInsightsManager,
  PostInsightsManager,
  type ReadabilityMetrics,
  type PostInsightsResult,
} from "./postInsights";

export {
  publishValidator,
  PublishValidator,
  type ValidationIssue,
  type ValidationOptions,
} from "./publishValidator";
