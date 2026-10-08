// =============================================================================
//  AI CONTENT STUDIO — SCHEMAS & TYPES
//  ai/content-studio/schemas.ts
// =============================================================================

import { z } from "zod";

export const ContentGoalEnum = z.enum([
  "seo",
  "educational",
  "thought_leadership",
  "product",
  "news",
]);
export type ContentGoal = z.infer<typeof ContentGoalEnum>;

export const ContentTypeEnum = z.enum([
  "guide",
  "comparison",
  "tutorial",
  "explainer",
  "listicle",
  "case_study",
  "news",
]);
export type ContentType = z.infer<typeof ContentTypeEnum>;

export const ContentDifficultyEnum = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);
export type ContentDifficulty = z.infer<typeof ContentDifficultyEnum>;

export const SearchIntentEnum = z.enum([
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);
export type SearchIntent = z.infer<typeof SearchIntentEnum>;

export const ContentRelationshipEnum = z.enum([
  "new_topic",
  "supports_existing",
  "comparison",
  "follow_up",
  "content_gap",
]);
export type ContentRelationship = z.infer<typeof ContentRelationshipEnum>;

export const ContentRoleEnum = z.enum(["pillar", "supporting"]);
export type ContentRole = z.infer<typeof ContentRoleEnum>;

export const DuplicateRiskSchema = z.object({
  isDuplicateRisk: z.boolean().default(false),
  similarityScore: z.number().min(0).max(100).default(0),
  matchedArticleTitle: z.string().optional(),
  matchedArticleSlug: z.string().optional(),
  mitigationNote: z.string().optional(),
});
export type DuplicateRisk = z.infer<typeof DuplicateRiskSchema>;

export const InternalLinkDetailSchema = z.object({
  direction: z.enum(["inbound", "outbound", "bidirectional"]).default("inbound"),
  articleTitle: z.string(),
  articleSlug: z.string(),
  recommendedAnchorText: z.string(),
  strategicReason: z.string(),
});
export type InternalLinkDetail = z.infer<typeof InternalLinkDetailSchema>;

export const ClusterArticleNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  role: ContentRoleEnum.default("supporting"),
  status: z.enum(["published", "draft", "gap", "planned"]).default("published"),
  recommendedNext: z.boolean().optional().default(false),
});
export type ClusterArticleNode = z.infer<typeof ClusterArticleNodeSchema>;

export const ContentClusterSubtopicSchema = z.object({
  name: z.string(),
  articles: z.array(ClusterArticleNodeSchema).default([]),
  coverageScore: z.number().min(0).max(100).default(0),
  nextLogicalArticle: z.string().optional(),
  nextLogicalReason: z.string().optional(),
});
export type ContentClusterSubtopic = z.infer<typeof ContentClusterSubtopicSchema>;

export const HierarchicalClusterSchema = z.object({
  pillarDomain: z.string(),
  subtopics: z.array(ContentClusterSubtopicSchema).default([]),
});
export type HierarchicalCluster = z.infer<typeof HierarchicalClusterSchema>;

export const TopicCoverageSchema = z.object({
  overallScore: z.number().min(0).max(100).default(0),
  publishedCount: z.number().default(0),
  draftCount: z.number().default(0),
  gapCount: z.number().default(0),
  clusterHealth: z.string().default("Growing"),
});
export type TopicCoverage = z.infer<typeof TopicCoverageSchema>;

export const NextLogicalRecommendationSchema = z.object({
  articleTitle: z.string(),
  clusterName: z.string(),
  contentRole: ContentRoleEnum.default("supporting"),
  rationale: z.string(),
});
export type NextLogicalRecommendation = z.infer<typeof NextLogicalRecommendationSchema>;

export const ContentClusterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  existingArticles: z.array(z.string()).default([]),
  gapRecommendations: z.array(z.string()).default([]),
});
export type ContentCluster = z.infer<typeof ContentClusterSchema>;

export const InternalLinkOpportunitySchema = z.object({
  sourceTitle: z.string(),
  sourceSlug: z.string(),
  recommendedAngle: z.string(),
});
export type InternalLinkOpportunity = z.infer<typeof InternalLinkOpportunitySchema>;

export const ContentIntelligenceSchema = z.object({
  existingCount: z.number().default(0),
  summary: z.string(),
  coveredTopics: z.array(z.string()).default([]),
  recommendedGaps: z.array(z.string()).default([]),
  clusters: z.array(ContentClusterSchema).optional().default([]),
  hierarchicalClusters: z.array(HierarchicalClusterSchema).optional().default([]),
  topicCoverage: TopicCoverageSchema.optional(),
  nextLogicalRecommendation: NextLogicalRecommendationSchema.optional(),
  internalLinkOpportunities: z.array(InternalLinkOpportunitySchema).optional().default([]),
  duplicateWarnings: z.array(z.string()).optional().default([]),
});
export type ContentIntelligence = z.infer<typeof ContentIntelligenceSchema>;

export const ContentIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  hook: z.string(),
  contentType: ContentTypeEnum,
  category: z.string(),
  targetAudience: z.string(),
  difficulty: ContentDifficultyEnum,
  searchIntent: SearchIntentEnum,
  keywords: z.array(z.string()).default([]),
  contentRelationship: ContentRelationshipEnum.optional().default("new_topic"),
  contentRole: ContentRoleEnum.optional().default("supporting"),
  isNextLogicalArticle: z.boolean().optional(),
  nextLogicalReason: z.string().optional(),
  duplicateRisk: DuplicateRiskSchema.optional(),
  relatedArticleTitle: z.string().optional(),
  relatedArticleSlug: z.string().optional(),
  internalLinkOpportunity: z.string().optional(),
  internalLinkingSuggestions: z.array(InternalLinkDetailSchema).optional().default([]),
});
export type ContentIdea = z.infer<typeof ContentIdeaSchema>;

export const GenerateIdeasInputSchema = z.object({
  topic: z.string().min(1),
  contentGoal: ContentGoalEnum.default("seo"),
  numberOfIdeas: z.number().min(1).max(20).default(10),
  existingCategories: z.array(z.string()).optional(),
});
export type GenerateIdeasInput = z.infer<typeof GenerateIdeasInputSchema>;

export const ContentBriefSchema = z.object({
  targetAudience: z.array(z.string()),
  tone: z.string(),
  length: z.string(),
  category: z.string(),
  objective: z.string(),
});
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const GenerateBriefInputSchema = z.object({
  idea: ContentIdeaSchema,
  existingCategories: z.array(z.string()).optional(),
});
export type GenerateBriefInput = z.infer<typeof GenerateBriefInputSchema>;

export const OutlineSectionSchema = z.object({
  id: z.string(),
  heading: z.string(),
  purpose: z.string(),
  keyPoints: z.array(z.string()),
});
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;

export const OutlineFaqItemSchema = z.object({
  question: z.string(),
  answerDirection: z.string(),
});
export type OutlineFaqItem = z.infer<typeof OutlineFaqItemSchema>;

export const ContentOutlineSchema = z.object({
  title: z.string(),
  introduction: z.string(),
  sections: z.array(OutlineSectionSchema),
  conclusion: z.string(),
  faq: z.array(OutlineFaqItemSchema).optional().default([]),
});
export type ContentOutline = z.infer<typeof ContentOutlineSchema>;

export const OutlineGeneratorInputSchema = z.object({
  idea: ContentIdeaSchema,
  contentBrief: ContentBriefSchema,
});
export type OutlineGeneratorInput = z.infer<typeof OutlineGeneratorInputSchema>;
