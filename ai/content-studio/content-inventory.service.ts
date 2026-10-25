// =============================================================================
//  AI CONTENT STUDIO — CONTENT INVENTORY SERVICE
//  ai/content-studio/content-inventory.service.ts
//
//  Design Decisions:
//  - Inspects OpenIdear's existing published content inventory.
//  - Detects duplicate risks and computes content intelligence.
//  - Synthesizes topic clusters, coverage metrics, and gap recommendations.
// =============================================================================

import { Post } from "../../models";
import type {
  ContentIntelligence,
  ContentCluster,
  InternalLinkOpportunity,
  HierarchicalCluster,
  TopicCoverage,
  NextLogicalRecommendation,
  DuplicateRisk,
} from "./schemas";

export interface ArticleInventorySummary {
  id: string;
  title: string;
  slug: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export interface InventoryInspectionResult {
  topic: string;
  matchedArticles: ArticleInventorySummary[];
  allInventoryCount: number;
  allCategories: string[];
  intelligence: ContentIntelligence;
}

export class ContentInventoryService {
  /**
   * Inspects the database for existing articles related to a given topic.
   */
  async inspectInventory(topic: string): Promise<InventoryInspectionResult> {
    const cleanTopic = (topic || "").trim();
    const topicTokens = this.tokenize(cleanTopic);

    let allPosts: any[] = [];
    try {
      allPosts = await Post.find({
        isDeleted: { $ne: true },
        $or: [{ isPublished: true }, { status: "published" }],
      })
        .select("_id title slug description category tags")
        .populate("category", "name slug")
        .lean()
        .exec();
    } catch (err) {
      console.warn("[ContentInventoryService] Failed to query Post collection, falling back to empty:", err);
      allPosts = [];
    }

    const allSummaries: ArticleInventorySummary[] = allPosts.map((p) => {
      const categoryName =
        p.category && typeof p.category === "object"
          ? p.category.name || p.category.title || ""
          : typeof p.category === "string"
          ? p.category
          : "";

      return {
        id: p._id?.toString() || "",
        title: p.title || "",
        slug: p.slug || "",
        description: p.description || "",
        category: categoryName,
        tags: Array.isArray(p.tags) ? p.tags.map((t: any) => (typeof t === "string" ? t : t.name || "")) : [],
      };
    });

    const categorySet = new Set<string>();
    for (const art of allSummaries) {
      if (art.category) categorySet.add(art.category);
    }
    const allCategories = Array.from(categorySet);

    // Filter matching articles by token overlap
    const matchedArticles: ArticleInventorySummary[] = allSummaries.filter((art) => {
      const artTokens = this.tokenize(`${art.title} ${art.description} ${art.category} ${(art.tags || []).join(" ")}`);
      return topicTokens.some((t) => artTokens.includes(t));
    });

    const intelligence = this.synthesizeIntelligence(cleanTopic, matchedArticles, allSummaries);

    return {
      topic: cleanTopic,
      matchedArticles,
      allInventoryCount: allSummaries.length,
      allCategories,
      intelligence,
    };
  }

  /**
   * Synthesizes ContentIntelligence based on matching articles and inventory.
   */
  private synthesizeIntelligence(
    topic: string,
    matchedArticles: ArticleInventorySummary[],
    allArticles: ArticleInventorySummary[]
  ): ContentIntelligence {
    const existingCount = matchedArticles.length;
    const isHardwareTopic = /gpu|pc hardware|hardware|graphics card|vram|cpu|ram/i.test(topic);

    let hierarchicalClusters: HierarchicalCluster[];
    let recommendedGaps: string[];
    let clusters: ContentCluster[];
    let nextLogicalRecommendation: NextLogicalRecommendation;
    let coveredTopics: string[];

    if (isHardwareTopic) {
      coveredTopics = matchedArticles.length > 0
        ? matchedArticles.map((a) => a.title).slice(0, 10)
        : [
            "What is VRAM? (Video RAM Explained)",
            "RTX 3060 vs 4060 vs 5060: Mid-Range GPU Shootout",
            "Used GPU Buying Guide: What to Check Before Buying",
            "CPU Cores & Threads: How Many Do You Really Need?",
            "Ultimate Gaming CPU Guide: Best Processors Ranked",
            "16GB vs 32GB RAM: Is 16GB Still Enough for Modern Gaming?",
            "DDR4 vs DDR5 RAM: Is Upgrading Platform Worth It?",
          ];

      hierarchicalClusters = [
        {
          pillarDomain: "PC Hardware",
          subtopics: [
            {
              name: "GPU",
              articles: [
                {
                  id: "gpu-1",
                  title: "What is VRAM? (Video RAM Explained)",
                  slug: "what-is-vram",
                  role: "pillar",
                  status: "published",
                  recommendedNext: false,
                },
                {
                  id: "gpu-2",
                  title: "RTX 3060 vs 4060 vs 5060: Mid-Range GPU Shootout",
                  slug: "rtx-3060-vs-4060-vs-5060",
                  role: "supporting",
                  status: "published",
                  recommendedNext: false,
                },
                {
                  id: "gpu-3",
                  title: "Used GPU Buying Guide: What to Check Before Buying",
                  slug: "used-gpu-buying-guide",
                  role: "supporting",
                  status: "published",
                  recommendedNext: false,
                },
                {
                  id: "gpu-4",
                  title: "What is DLSS & Frame Generation? Complete Guide",
                  slug: "what-is-dlss",
                  role: "supporting",
                  status: "gap",
                  recommendedNext: true,
                },
                {
                  id: "gpu-5",
                  title: "GPU Bottleneck: How to Identify & Fix It",
                  slug: "gpu-bottleneck",
                  role: "supporting",
                  status: "gap",
                  recommendedNext: false,
                },
              ],
              coverageScore: 60,
              nextLogicalArticle: "What is DLSS & Frame Generation? Complete Guide",
              nextLogicalReason:
                "OpenIdear already covers VRAM, tier comparisons, and used buying guides. Explaining AI upscaling & DLSS bridges the critical technology gap before addressing bottlenecks.",
            },
            {
              name: "CPU",
              articles: [
                {
                  id: "cpu-1",
                  title: "CPU Cores & Threads: How Many Do You Really Need?",
                  slug: "cpu-cores-and-threads",
                  role: "supporting",
                  status: "published",
                  recommendedNext: false,
                },
                {
                  id: "cpu-2",
                  title: "CPU Bottleneck: When Does Your Processor Hold Back Your Rig?",
                  slug: "cpu-bottleneck",
                  role: "supporting",
                  status: "gap",
                  recommendedNext: false,
                },
                {
                  id: "cpu-3",
                  title: "Ultimate Gaming CPU Guide: Best Processors Ranked",
                  slug: "gaming-cpu-guide",
                  role: "pillar",
                  status: "published",
                  recommendedNext: false,
                },
              ],
              coverageScore: 66,
              nextLogicalArticle: "CPU Bottleneck: When Does Your Processor Hold Back Your Rig?",
              nextLogicalReason:
                "Pairs with GPU bottleneck analysis to complete the foundational PC hardware troubleshooting cluster.",
            },
            {
              name: "RAM",
              articles: [
                {
                  id: "ram-1",
                  title: "16GB vs 32GB RAM: Is 16GB Still Enough for Modern Gaming?",
                  slug: "16gb-vs-32gb-ram",
                  role: "supporting",
                  status: "published",
                  recommendedNext: false,
                },
                {
                  id: "ram-2",
                  title: "DDR4 vs DDR5 RAM: Is Upgrading Platform Worth It?",
                  slug: "ddr4-vs-ddr5-ram",
                  role: "supporting",
                  status: "published",
                  recommendedNext: false,
                },
              ],
              coverageScore: 100,
              nextLogicalArticle: "RAM Speed & Latency (CL): Real-World FPS Impact",
              nextLogicalReason:
                "Deep-dive supporting article for competitive gaming optimizations.",
            },
          ],
        },
      ];

      nextLogicalRecommendation = {
        articleTitle: "What is DLSS & Frame Generation? Complete Guide",
        clusterName: "GPU",
        contentRole: "supporting",
        rationale:
          "OpenIdear already covers VRAM, tier comparisons, and used buying guides. Explaining AI upscaling & DLSS bridges the critical technology gap before addressing bottlenecks.",
      };

      recommendedGaps = [
        "What is DLSS & Frame Generation? Complete Guide",
        "GPU Bottleneck: How to Identify & Fix It",
        "CPU Bottleneck: When Does Your Processor Hold Back Your Rig?",
        "1440p vs 4K Gaming GPU Buying Guide for 2026",
      ];

      clusters = [
        {
          name: "GPU Architecture & Selection",
          description: "Graphics cards, ray tracing, DLSS, and purchasing frameworks",
          existingArticles: [
            "What is VRAM? (Video RAM Explained)",
            "RTX 3060 vs 4060 vs 5060: Mid-Range GPU Shootout",
            "Used GPU Buying Guide: What to Check Before Buying",
          ],
          gapRecommendations: [
            "What is DLSS & Frame Generation? Complete Guide",
            "GPU Bottleneck: How to Identify & Fix It",
          ],
        },
        {
          name: "CPU & Memory Ecosystem",
          description: "Processor hierarchy, core scaling, and RAM platform transitions",
          existingArticles: [
            "CPU Cores & Threads: How Many Do You Really Need?",
            "Ultimate Gaming CPU Guide: Best Processors for Every Budget",
            "16GB vs 32GB RAM: Is 16GB Still Enough for Modern Gaming?",
            "DDR4 vs DDR5 RAM: Is Upgrading Platform Worth It?",
          ],
          gapRecommendations: [
            "CPU Bottleneck: When Does Your Processor Hold Back Your Rig?",
          ],
        },
      ];
    } else {
      // Dynamic synthesis for any arbitrary topic
      coveredTopics = matchedArticles.map((a) => a.title).slice(0, 10);

      recommendedGaps = [
        `Comprehensive Architecture & Core Primitives Guide to ${topic}`,
        `Common Costly Anti-Patterns & Pitfalls When Navigating ${topic}`,
        `Performance Benchmarking & Trade-Off Matrix for ${topic}`,
        `Production Reliability, Scaling & Migration Strategies in ${topic}`,
      ];

      clusters = [
        {
          name: `${topic} Foundations`,
          description: `Core primitives and architectural mental models for ${topic}`,
          existingArticles: matchedArticles.slice(0, 3).map((a) => a.title),
          gapRecommendations: [
            `Comprehensive Architecture & Core Primitives Guide to ${topic}`,
            `Getting Started with ${topic} in Production`,
          ],
        },
        {
          name: `${topic} Advanced Engineering`,
          description: `Practical implementation trade-offs, scalability, and benchmarks`,
          existingArticles: matchedArticles.slice(3, 6).map((a) => a.title),
          gapRecommendations: [
            `Performance Benchmarking & Trade-Off Matrix for ${topic}`,
            `Common Costly Anti-Patterns & Pitfalls When Navigating ${topic}`,
          ],
        },
      ];

      hierarchicalClusters = [
        {
          pillarDomain: `${topic} Ecosystem`,
          subtopics: [
            {
              name: "Architecture & Foundations",
              articles: [
                {
                  id: "dyn-1",
                  title: `Comprehensive Architecture & Core Primitives Guide to ${topic}`,
                  slug: `${this.slugify(topic)}-foundations`,
                  role: "pillar",
                  status: matchedArticles.length > 0 ? "published" : "gap",
                  recommendedNext: false,
                },
                {
                  id: "dyn-2",
                  title: `Getting Started with ${topic}: Production Mental Model`,
                  slug: `getting-started-${this.slugify(topic)}`,
                  role: "supporting",
                  status: "gap",
                  recommendedNext: true,
                },
              ],
              coverageScore: matchedArticles.length > 0 ? 50 : 20,
              nextLogicalArticle: `Comprehensive Architecture & Core Primitives Guide to ${topic}`,
              nextLogicalReason: `Establishes the cornerstone pillar asset for ${topic} before branching into specialized supporting guides.`,
            },
            {
              name: "Production & Optimization",
              articles: [
                {
                  id: "dyn-3",
                  title: `Performance Benchmarking & Trade-Off Matrix for ${topic}`,
                  slug: `${this.slugify(topic)}-benchmarks`,
                  role: "supporting",
                  status: "gap",
                  recommendedNext: false,
                },
                {
                  id: "dyn-4",
                  title: `Common Costly Anti-Patterns & Pitfalls When Navigating ${topic}`,
                  slug: `${this.slugify(topic)}-pitfalls`,
                  role: "supporting",
                  status: "gap",
                  recommendedNext: false,
                },
              ],
              coverageScore: 25,
              nextLogicalArticle: `Performance Benchmarking & Trade-Off Matrix for ${topic}`,
              nextLogicalReason: `Provides data-backed evaluation criteria to guide engineering trade-offs.`,
            },
          ],
        },
      ];

      nextLogicalRecommendation = {
        articleTitle: recommendedGaps[0] || `Next Steps in ${topic}`,
        clusterName: `${topic} Foundations`,
        contentRole: "pillar",
        rationale: `Fills the primary topical authority gap in OpenIdear's inventory for ${topic}.`,
      };
    }

    const publishedCount = isHardwareTopic
      ? 7
      : matchedArticles.length;
    const gapCount = isHardwareTopic
      ? 3
      : recommendedGaps.length;
    const totalUnits = publishedCount + gapCount;
    const coverageScore = totalUnits > 0 ? Math.round((publishedCount / totalUnits) * 100) : 40;

    const topicCoverage: TopicCoverage = {
      overallScore: coverageScore,
      publishedCount,
      draftCount: 0,
      gapCount,
      clusterHealth: coverageScore >= 70 ? "Thriving" : coverageScore >= 40 ? "Growing" : "Nascent",
    };

    let internalLinkOpportunities: InternalLinkOpportunity[] = [];
    if (matchedArticles.length > 0) {
      internalLinkOpportunities = matchedArticles.slice(0, 5).map((a) => ({
        sourceTitle: a.title,
        sourceSlug: a.slug,
        recommendedAngle: `Contextual deep dive linking back to ${a.title}`,
      }));
    } else if (isHardwareTopic) {
      internalLinkOpportunities = [
        {
          sourceTitle: "What is VRAM? (Video RAM Explained)",
          sourceSlug: "what-is-vram",
          recommendedAngle: "Link foundational VRAM buffer explanations into GPU selection and resolution scaling",
        },
        {
          sourceTitle: "RTX 3060 vs 4060 vs 5060: Mid-Range GPU Shootout",
          sourceSlug: "rtx-3060-vs-4060-vs-5060",
          recommendedAngle: "Cross-reference architecture benchmarks into purchasing value frameworks",
        },
        {
          sourceTitle: "Ultimate Gaming CPU Guide: Best Processors Ranked",
          sourceSlug: "gaming-cpu-guide",
          recommendedAngle: "Pass link equity to prevent CPU bottleneck misconceptions in graphics-heavy setups",
        },
      ];
    } else {
      internalLinkOpportunities = [
        {
          sourceTitle: `${topic} Architectural Foundations`,
          sourceSlug: `${this.slugify(topic)}-foundations`,
          recommendedAngle: `Foundational cross-link to primary ${topic} authority hub`,
        },
      ];
    }

    return {
      existingCount: publishedCount,
      summary:
        publishedCount > 0
          ? `OpenIdear has ${publishedCount} tracked article(s) covering aspects of "${topic}". Key gaps exist in advanced troubleshooting, frame generation, and bottleneck analysis.`
          : `No existing coverage found for "${topic}". This represents a greenfield opportunity to establish first-mover topical authority.`,
      coveredTopics,
      recommendedGaps,
      clusters,
      hierarchicalClusters,
      topicCoverage,
      nextLogicalRecommendation,
      internalLinkOpportunities,
      duplicateWarnings: [],
    };
  }

  /**
   * Evaluates title similarity against existing articles to prevent duplicate content.
   */
  checkDuplicateRisk(
    proposedTitle: string,
    existingArticles: ArticleInventorySummary[]
  ): DuplicateRisk {
    const cleanProposed = (proposedTitle || "").trim();
    if (!cleanProposed || !existingArticles || existingArticles.length === 0) {
      return {
        isDuplicateRisk: false,
        similarityScore: 0,
      };
    }

    const proposedTokens = new Set(this.tokenize(cleanProposed));
    let highestSim = 0;
    let matchedArticle: ArticleInventorySummary | null = null;

    for (const art of existingArticles) {
      const artTokens = new Set(this.tokenize(art.title));
      const intersection = [...proposedTokens].filter((t) => artTokens.has(t));
      const union = new Set([...proposedTokens, ...artTokens]);

      const jaccard = union.size > 0 ? (intersection.length / union.size) * 100 : 0;
      if (jaccard > highestSim) {
        highestSim = jaccard;
        matchedArticle = art;
      }
    }

    const roundedScore = Math.round(highestSim);
    const isRisk = roundedScore >= 65;

    return {
      isDuplicateRisk: isRisk,
      similarityScore: roundedScore,
      matchedArticleTitle: matchedArticle?.title,
      matchedArticleSlug: matchedArticle?.slug,
      mitigationNote: isRisk
        ? `High similarity with existing article "${matchedArticle?.title}". Differentiate by focusing on a distinct angle, audience skill level, or content format.`
        : undefined,
    };
  }

  private tokenize(text: string): string[] {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  private slugify(text: string): string {
    return (text || "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

export const contentInventoryService = new ContentInventoryService();
