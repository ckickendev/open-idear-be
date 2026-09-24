// =============================================================================
//  OPENIDEAR — AI VISUAL CLASSIFIER & DECISION ENGINE (SPRINT 4)
//  ai/visual-intelligence/visualClassifier.service.ts
//
//  Decides WHAT visual treatment an article section needs.
//  Supported Visual Decision Types:
//    - SEARCH_IMAGE
//    - GENERATE_IMAGE
//    - DIAGRAM
//    - SCREENSHOT
//    - CHART
//    - CODE_VISUAL
//    - NO_VISUAL
//
//  Decision Rules:
//  - Product review -> SEARCH_IMAGE
//  - Architecture explanation -> DIAGRAM / GENERATE_IMAGE
//  - Numerical benchmark -> CHART
//  - UI tutorial -> SCREENSHOT
//  - Programming explanation -> CODE_VISUAL
//  - Simple conceptual paragraph / conclusion -> NO_VISUAL
//
//  "The AI should prefer NO_VISUAL when a visual adds little value.
//   Avoid over-generating images."
// =============================================================================

export type VisualDecisionType =
  | "SEARCH_IMAGE"
  | "GENERATE_IMAGE"
  | "DIAGRAM"
  | "SCREENSHOT"
  | "CHART"
  | "CODE_VISUAL"
  | "NO_VISUAL";

export type VisualType =
  | "diagram"
  | "illustration"
  | "screenshot"
  | "product"
  | "comparison"
  | "chart"
  | "code"
  | "none"
  | VisualDecisionType;

export type RecommendedAction =
  | "search"
  | "generate"
  | "diagram"
  | "chart"
  | "screenshot"
  | "comparison"
  | "code"
  | "none";

export interface VisualRecommendation {
  heading: string;
  visualType: VisualType;
  recommendation: VisualDecisionType;
  confidence: number;
  searchQuery: string;
  imagePrompt: string;
  reason: string;
  recommendedAction: RecommendedAction;
  suggestedPrompt?: string;
  suggestedSearchQuery?: string;
  suggestedPreset?: "isometric" | "blueprint" | "flat_vector" | "3d_technical";
}

export interface SectionAnalysis {
  heading: string;
  level: number;
  content: string;
  isCompleted: boolean;
  existingImageUrls: string[];
  recommendation: VisualRecommendation;
}

export class VisualClassifierService {
  public static readonly MIN_CONFIDENCE_THRESHOLD = 0.70;

  /**
   * Rule definitions for active visual opportunities.
   */
  private static readonly RULES = [
    // 1. Comparison Rule -> GENERATE_IMAGE / DIAGRAM
    {
      type: "comparison" as VisualType,
      action: "comparison" as RecommendedAction,
      decision: "GENERATE_IMAGE" as VisualDecisionType,
      reason: "Side-by-side feature comparisons are best presented in a split comparison layout.",
      patterns: [
        /\b(?:vs\.?|versus)\b/i,
        /\b(?:comparison|compared to|difference between)\b/i,
        /\b(?:pros and cons|trade-offs?|tradeoffs?)\b/i,
        /\b(?:alternatives? to)\b/i,
      ],
      keywords: ["vs", "versus", "comparison", "compare", "differ", "difference", "tradeoff", "trade-off", "alternative"],
      suggestedPreset: "flat_vector" as const,
    },
    // 2. Numerical Benchmark Rule -> CHART
    {
      type: "chart" as VisualType,
      action: "chart" as RecommendedAction,
      decision: "CHART" as VisualDecisionType,
      reason: "Benchmark and performance metrics are best communicated with data charts.",
      patterns: [
        /\b(?:benchmarks?|performance metrics?|throughput|latency)\b/i,
        /\b(?:rps|qps|requests per sec(?:ond)?|response time)\b/i,
        /\b(?:speed test|load test|stress test|scalability test)\b/i,
        /\b(?:metrics?|statistics?|telemetry charts?)\b/i,
      ],
      keywords: ["benchmark", "benchmarks", "latency", "throughput", "rps", "qps", "ms", "p99", "p95", "metrics", "chart", "graph"],
      suggestedPreset: "blueprint" as const,
    },
    // 3. Product Review Rule -> SEARCH_IMAGE
    {
      type: "product" as VisualType,
      action: "search" as RecommendedAction,
      decision: "SEARCH_IMAGE" as VisualDecisionType,
      reason: "Product reviews require authentic hardware/software photography.",
      patterns: [
        /\b(?:review|hands-on|unboxing|first look)\b/i,
        /\b(?:hardware specs?|specifications?|chassis|ports|camera)\b/i,
        /\b(?:macbook|iphone|ipad|thinkpad|galaxy|pixel|gpu|rtx|apple silicon)\b/i,
        /\b(?:pricing|buyer's guide|edition|buy now)\b/i,
      ],
      keywords: ["review", "unboxing", "hands-on", "hardware", "macbook", "laptop", "phone", "specs", "specification", "pricing", "gadget", "device"],
      suggestedPreset: "flat_vector" as const,
    },
    // 4. UI Tutorial Rule -> SCREENSHOT
    {
      type: "screenshot" as VisualType,
      action: "screenshot" as RecommendedAction,
      decision: "SCREENSHOT" as VisualDecisionType,
      reason: "Tutorial instructions are clearest with step-by-step UI screenshots.",
      patterns: [
        /\b(?:tutorial|how to|step[- ]by[- ]step|walkthrough)\b/i,
        /\b(?:installation|installing|setup guide|getting started)\b/i,
        /\b(?:configure|configuration|dashboard ui|user interface|admin panel)\b/i,
      ],
      keywords: ["tutorial", "setup", "install", "installation", "guide", "step-by-step", "walkthrough", "configure", "dashboard", "interface"],
      suggestedPreset: "flat_vector" as const,
    },
    // 5. Architecture Explanation Rule -> DIAGRAM
    {
      type: "diagram" as VisualType,
      action: "diagram" as RecommendedAction,
      decision: "DIAGRAM" as VisualDecisionType,
      reason: "This section explains system architecture and component interactions.",
      patterns: [
        /\b(?:architecture|system design|event flow|data flow)\b/i,
        /\b(?:topology|infrastructure|microservices?|distributed)\b/i,
        /\b(?:pipeline|orchestration|cluster|broker|lifecycle)\b/i,
        /\b(?:internals?|protocol|state machine|under the hood)\b/i,
      ],
      keywords: ["architecture", "flow", "diagram", "kafka", "redis", "microservices", "pipeline", "distributed", "cluster", "broker", "topology", "lifecycle"],
      suggestedPreset: "isometric" as const,
    },
    // 6. Programming / Algorithm Rule -> CODE_VISUAL
    {
      type: "code" as VisualType,
      action: "code" as RecommendedAction,
      decision: "CODE_VISUAL" as VisualDecisionType,
      reason: "Technical implementation and algorithms are best highlighted with syntax-formatted code.",
      patterns: [
        /\b(?:implementation|code snippet|algorithm|syntax|data structure)\b/i,
        /\b(?:function|class|method|handler|controller code)\b/i,
      ],
      keywords: ["implementation", "algorithm", "syntax", "function", "controller", "handler", "recursion"],
      suggestedPreset: "blueprint" as const,
    },
  ];

  /**
   * Classify a single section by heading and optional content.
   */
  public classifySection(heading: string, content: string = ""): VisualRecommendation {
    const cleanHeading = (heading || "").trim();
    const cleanContent = (content || "").trim().slice(0, 2000);

    const headingLower = cleanHeading.toLowerCase();
    const contentLower = cleanContent.toLowerCase();

    // ── 1. Strict Exclusion Check for Conclusion, Summary, License, About ─────
    const isStrictConclusionOrIntro =
      /^(conclusion|summary|wrap[- ]up|final thoughts|closing remarks?|takeaways?|references|disclaimer|license|acknowledgements?|about the author|about this guide)$/i.test(
        cleanHeading
      );

    if (isStrictConclusionOrIntro) {
      return {
        heading: cleanHeading,
        visualType: "none",
        recommendation: "NO_VISUAL",
        confidence: 0.90,
        reason: "Conclusion or summary section where an image adds little value.",
        recommendedAction: "none",
        imagePrompt: "",
        searchQuery: "",
      };
    }

    // ── 2. Evaluate Active Visual Rules ───────────────────────────────────────
    let bestMatch: {
      type: VisualType;
      action: RecommendedAction;
      decision: VisualDecisionType;
      reason: string;
      score: number;
      headingMatched: boolean;
      suggestedPreset?: "isometric" | "blueprint" | "flat_vector" | "3d_technical";
    } | null = null;

    for (const rule of VisualClassifierService.RULES) {
      let score = 0;
      let headingScore = 0;

      // Direct regex match on heading (strong signal)
      for (const pattern of rule.patterns) {
        if (pattern.test(headingLower)) {
          score += 5.0;
          headingScore += 5.0;
          break;
        }
      }

      // Keywords in heading
      for (const kw of rule.keywords) {
        if (headingLower.includes(kw)) {
          score += 3.0;
          headingScore += 3.0;
        }
      }

      // Direct regex match on content
      for (const pattern of rule.patterns) {
        if (pattern.test(contentLower)) {
          score += 2.0;
          break;
        }
      }

      // Keywords in content
      let contentHits = 0;
      for (const kw of rule.keywords) {
        if (contentLower.includes(kw)) {
          contentHits++;
          if (contentHits <= 3) {
            score += 0.8;
          }
        }
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          type: rule.type,
          action: rule.action,
          decision: rule.decision,
          reason: rule.reason,
          score,
          headingMatched: headingScore > 0,
          suggestedPreset: rule.suggestedPreset,
        };
      }
    }

    // If heading has 0 matches, require content to have strong technical focus (score >= 4.5)
    const minRequiredScore = bestMatch && bestMatch.headingMatched ? 3.0 : 4.5;
    if (!bestMatch || bestMatch.score < minRequiredScore) {
      return {
        heading: cleanHeading || "General Section",
        visualType: "none",
        recommendation: "NO_VISUAL",
        confidence: 0.60, // Below threshold -> NO_VISUAL
        reason: "General prose section where a visual adds little value.",
        recommendedAction: "none",
        imagePrompt: "",
        searchQuery: "",
      };
    }

    // Normalized confidence between 0.72 and 0.98
    let confidence = 0.70 + Math.min(bestMatch.score * 0.035, 0.28);
    confidence = Math.round(confidence * 100) / 100;

    let visualType = bestMatch.type;
    let decision = bestMatch.decision;
    let action = bestMatch.action;
    let reason = bestMatch.reason;

    // Refinement: Architecture explanation -> DIAGRAM or GENERATE_IMAGE
    if (visualType === "diagram") {
      if (headingLower.includes("illustration") || headingLower.includes("concept")) {
        decision = "GENERATE_IMAGE";
        action = "generate";
      } else {
        decision = "DIAGRAM";
        action = "diagram";
      }
    } else if (visualType === "product") {
      decision = "SEARCH_IMAGE";
      action = "search";
    }

    const preset = bestMatch.suggestedPreset || "isometric";
    const imagePrompt = `Modern ${preset} technical illustration of ${cleanHeading}, software engineering architecture, clean dark background`;
    const searchQuery = `${cleanHeading} ${visualType === "product" ? "hardware photo" : "diagram architecture"}`;

    return {
      heading: cleanHeading,
      visualType,
      recommendation: decision,
      confidence,
      reason,
      recommendedAction: action,
      imagePrompt,
      searchQuery,
      suggestedPrompt: imagePrompt,
      suggestedSearchQuery: searchQuery,
      suggestedPreset: preset,
    };
  }

  /**
   * Analyze an entire article markdown document.
   */
  public analyzeArticle(markdown: string): SectionAnalysis[] {
    if (!markdown || !markdown.trim()) {
      return [];
    }

    const lines = markdown.split(/\r?\n/);
    const sections: Array<{
      heading: string;
      level: number;
      contentLines: string[];
    }> = [];

    let currentHeading: string | null = null;
    let currentLevel: number = 2;
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        if (currentHeading !== null) {
          sections.push({
            heading: currentHeading,
            level: currentLevel,
            contentLines: currentContent,
          });
        }
        currentLevel = headingMatch[1].length;
        currentHeading = headingMatch[2].trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    if (currentHeading !== null) {
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        contentLines: currentContent,
      });
    }

    const contentSections = sections.filter((s, idx) => {
      if (idx === 0 && s.level === 1 && s.contentLines.join("").trim().length === 0 && sections.length > 1) {
        return false;
      }
      return true;
    });

    if (contentSections.length === 0 && markdown.trim().length > 0) {
      contentSections.push({
        heading: "Overview",
        level: 1,
        contentLines: lines,
      });
    }

    return contentSections.map((sec) => {
      const sectionText = sec.contentLines.join("\n");
      const existingImageUrls: string[] = [];

      const mdImageMatches = sectionText.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g);
      for (const m of mdImageMatches) {
        if (m[1]) existingImageUrls.push(m[1].trim());
      }

      const htmlImageMatches = sectionText.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
      for (const m of htmlImageMatches) {
        if (m[1]) existingImageUrls.push(m[1].trim());
      }

      const isCompleted = existingImageUrls.length > 0;
      const recommendation = this.classifySection(sec.heading, sectionText);

      return {
        heading: sec.heading,
        level: sec.level,
        content: sectionText,
        isCompleted,
        existingImageUrls,
        recommendation,
      };
    });
  }
}

export const visualClassifierService = new VisualClassifierService();
