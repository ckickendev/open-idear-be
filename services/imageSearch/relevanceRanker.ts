// =============================================================================
//  RELEVANCE RANKER — SPRINT 2 FOUNDATION
//  services/imageSearch/relevanceRanker.ts
//
//  Design Decisions:
//  - Deterministic ranking layer scoring image candidates against visual suggestions.
//  - Transparent, explainable scoring criteria with documented score breakdowns:
//      1. Exact product/entity match (0..35 pts)
//      2. Context & section keyword overlap (0..25 pts)
//      3. Visual type compatibility (product vs diagram vs chart vs screenshot) (-15..+20 pts)
//      4. Resolution & editorial aspect ratio (-20..+15 pts)
//      5. Verified provider & license eligibility (0..15 pts)
//      6. Cross-section duplicate penalty (-50 pts)
//  - Clamps score to [0..100] and sorts descending.
//  - Does not invent fake user ratings or claim unverified content.
// =============================================================================

import type { ImageSearchResult } from "./imageSearchProvider.interface";

export interface RankContext {
  heading?: string;
  articleTitle?: string;
  sectionContent?: string;
  visualType?: string;
  searchQuery?: string;
  imagePrompt?: string;
  previouslySelectedUrls?: string[];
}

export interface RankedImageResult extends ImageSearchResult {
  /** Deterministic relevance score from 0 to 100 */
  readonly relevanceScore: number;
  /** Explainable breakdown reasons for author review */
  readonly relevanceReasons: string[];
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "with",
  "by", "about", "of", "from", "is", "are", "was", "were", "be", "been", "this",
  "that", "these", "those", "how", "what", "why", "when", "where", "which",
  "vs", "versus", "top", "best", "review", "guide", "overview", "part", "step",
]);

/**
 * Extracts key domain entities (hardware models, technologies, databases).
 */
function extractEntities(text: string): string[] {
  const normalized = text.toLowerCase();
  const entities: string[] = [];

  const patterns = [
    /\b(?:rtx\s*[0-9]{4}(?:\s*ti)?)\b/g,
    /\b(?:rx\s*[0-9]{4}(?:\s*xtx?|xt)?)\b/g,
    /\b(?:intel\s+core\s+i[3579]|core\s+i[3579]|i[3579]-[0-9]+k?)\b/g,
    /\b(?:ryzen\s*[0-9]|ryzen\s*[0-9]{4}x?(?:3d)?)\b/g,
    /\b(?:apple\s+m[1234](?:\s*max|\s*pro)?)\b/g,
    /\b(?:geforce|radeon|snapdragon|nvidia|amd|intel)\b/g,
    /\b(?:redis|kafka|postgresql|postgres|mongodb|mysql|sqlite)\b/g,
    /\b(?:docker|kubernetes|k8s|aws|azure|gcp|linux)\b/g,
    /\b(?:ddr[45]|motherboard|socket|pcie|vram|cpu|gpu)\b/g,
  ];

  for (const regex of patterns) {
    const matches = normalized.match(regex);
    if (matches) {
      for (const m of matches) {
        entities.push(m.trim().replace(/\s+/g, " "));
      }
    }
  }

  return Array.from(new Set(entities));
}

/**
 * Extracts non-stopword keyword tokens.
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Evaluates candidate image metadata against visual suggestion context.
 */
export function scoreCandidate(
  candidate: ImageSearchResult,
  context: RankContext
): { score: number; reasons: string[] } {
  let score = 40; // Base baseline score
  const reasons: string[] = [];

  const candidateCorpus = `${candidate.title || ""} ${candidate.alt || ""} ${(candidate.tags || []).join(" ")}`.toLowerCase();
  const headingText = (context.heading || "").toLowerCase();
  const titleText = (context.articleTitle || "").toLowerCase();
  const vType = (context.visualType || "").toLowerCase();

  // ─── 1. Exact Product / Entity Match (0..35 pts) ───────────────────────────
  const contextEntities = extractEntities(`${headingText} ${titleText} ${context.searchQuery || ""}`);
  if (contextEntities.length > 0) {
    let matchedEntity = false;
    for (const entity of contextEntities) {
      if (candidateCorpus.includes(entity)) {
        score += 35;
        reasons.push(`Exact entity match: "${entity}"`);
        matchedEntity = true;
        break;
      }
    }
    if (!matchedEntity) {
      // Partial brand or token match
      for (const entity of contextEntities) {
        const parts = entity.split(" ");
        if (parts.some((p) => candidateCorpus.includes(p) && p.length > 2)) {
          score += 15;
          reasons.push(`Partial entity match: "${parts.find((p) => candidateCorpus.includes(p))}"`);
          break;
        }
      }
    }
  }

  // ─── 2. Section Keyword Overlap (0..25 pts) ────────────────────────────────
  const headingKeywords = extractKeywords(headingText);
  let keywordMatches = 0;
  for (const kw of headingKeywords) {
    if (candidateCorpus.includes(kw)) {
      keywordMatches++;
    }
  }
  if (keywordMatches > 0) {
    const kwPoints = Math.min(25, keywordMatches * 7);
    score += kwPoints;
    reasons.push(`Matches ${keywordMatches} section keyword${keywordMatches > 1 ? "s" : ""}`);
  }

  // ─── 3. Visual Type Compatibility (-15..+20 pts) ───────────────────────────
  if (vType === "product" || vType === "search_image") {
    if (/\b(?:photography|photo|hardware|product|device|chassis|close[- ]up|angle)\b/.test(candidateCorpus)) {
      score += 20;
      reasons.push("Compatible with authentic product photography");
    } else if (/\b(?:diagram|clipart|vector|sketch|wireframe)\b/.test(candidateCorpus)) {
      score -= 15;
      reasons.push("Penalized: Clipart or diagram in product review section");
    }
  } else if (vType === "diagram") {
    if (/\b(?:diagram|architecture|topology|system|flow|network|infrastructure|database)\b/.test(candidateCorpus)) {
      score += 20;
      reasons.push("Compatible with technical architecture diagram");
    }
  } else if (vType === "chart") {
    if (/\b(?:benchmark|chart|metric|latency|throughput|performance|graph)\b/.test(candidateCorpus)) {
      score += 20;
      reasons.push("Compatible with benchmark/data visualization");
    }
  } else if (vType === "screenshot") {
    if (/\b(?:screenshot|interface|ui|dashboard|screen|console|cli)\b/.test(candidateCorpus)) {
      score += 20;
      reasons.push("Compatible with UI walkthrough/screenshot");
    }
  }

  // ─── 4. Image Resolution & Aspect Ratio (-20..+15 pts) ─────────────────────
  const w = candidate.width || 0;
  const h = candidate.height || 0;
  if (w >= 1200 && h >= 630) {
    score += 15;
    reasons.push("High-resolution asset (>=1200px)");
  } else if (w >= 800) {
    score += 8;
  } else if (w > 0 && w < 400) {
    score -= 20;
    reasons.push("Penalized: Low resolution thumbnail (<400px)");
  }

  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio >= 1.3 && ratio <= 1.85) {
      score += 5;
      reasons.push("Optimal editorial landscape aspect ratio");
    }
  }

  // ─── 5. Verified License & Attribution (0..15 pts) ─────────────────────────
  if (candidate.author && candidate.attributionUrl) {
    score += 10;
    reasons.push(`Verified attribution (${candidate.author})`);
  }
  if (candidate.license === "unsplash" || candidate.license === "pexels" || candidate.license === "cc0") {
    score += 5;
    reasons.push(`Free commercial license (${candidate.license})`);
  }

  // ─── 6. Cross-Section Duplicate Penalty (-50 pts) ──────────────────────────
  if (context.previouslySelectedUrls && context.previouslySelectedUrls.length > 0) {
    const isDup = context.previouslySelectedUrls.some(
      (u) => u === candidate.imageUrl || u === candidate.url || u === candidate.sourceUrl
    );
    if (isDup) {
      score -= 50;
      reasons.push("Penalized: Duplicate image already used in this article");
    }
  }

  // Clamp final score between 5 and 100
  const finalScore = Math.max(5, Math.min(100, Math.round(score)));

  return { score: finalScore, reasons };
}

/**
 * Ranks candidate images against visual suggestion context.
 */
export function rankCandidates(
  candidates: ImageSearchResult[],
  context: RankContext
): RankedImageResult[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const scoredList = candidates.map((candidate) => {
    const { score, reasons } = scoreCandidate(candidate, context);
    return {
      ...candidate,
      relevanceScore: score,
      relevanceReasons: reasons,
    };
  });

  // Sort descending by relevanceScore, breaking ties by width
  scoredList.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return (b.width || 0) - (a.width || 0);
  });

  return scoredList;
}
