// =============================================================================
//  AI WORKFLOW — POST INSIGHTS ENGINE
//  ai/workflow/postInsights.ts
//
//  Design Decisions:
//  - Implements the Flesch Reading Ease and difficulty classification engine.
//  - Analyzes Reading Time, Word Count, Images, Headings, Links, Tables, Code Blocks.
//  - Features syllable and sentence counting heuristics optimized for speed.
//  - Complies with strict exactOptionalPropertyTypes compilation parameters.
// =============================================================================

export interface ReadabilityMetrics {
  score: number;
  gradeLevel: string;
  difficulty: "easy" | "moderate" | "difficult";
}

export interface PostInsightsResult {
  readonly postId: string;
  readonly wordCount: number;
  readonly readingTimeMin: number;
  readonly imageCount: number;
  readonly headingCount: number;
  readonly linkCount: {
    readonly internal: number;
    readonly external: number;
  };
  readonly tableCount: number;
  readonly codeBlockCount: number;
  readonly readability: ReadabilityMetrics;
}

export class PostInsightsManager {
  /**
   * Approximate the number of syllables in a English word.
   */
  private countSyllables(word: string): number {
    const cleanWord = word.toLowerCase().trim();
    if (cleanWord.length <= 3) return 1;
    
    // Remove common silent endings
    const processedWord = cleanWord
      .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
      .replace(/^y/, "");

    // Count groupings of consecutive vowels
    const vowels = processedWord.match(/[aeiouy]{1,2}/g);
    return vowels ? vowels.length : 1;
  }

  /**
   * Evaluates Flesch Reading Ease index score and maps to a readability level.
   */
  calculateReadability(text: string): ReadabilityMetrics {
    const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0);
    const wordCount = words.length;
    if (wordCount === 0) {
      return { score: 100, gradeLevel: "N/A", difficulty: "easy" };
    }

    // Heuristic sentence segmentation
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const sentenceCount = Math.max(1, sentences.length);

    // Sum syllables across all words
    let syllableCount = 0;
    for (const w of words) {
      syllableCount += this.countSyllables(w);
    }

    // Flesch Reading Ease Formula
    const rawScore = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    // Categorization index mapping
    let gradeLevel = "Conversational (8th-9th Grade)";
    let difficulty: "easy" | "moderate" | "difficult" = "moderate";

    if (score >= 90) {
      gradeLevel = "Very Easy (5th Grade)";
      difficulty = "easy";
    } else if (score >= 80) {
      gradeLevel = "Easy (6th Grade)";
      difficulty = "easy";
    } else if (score >= 70) {
      gradeLevel = "Fairly Easy (7th Grade)";
      difficulty = "easy";
    } else if (score >= 60) {
      gradeLevel = "Standard (8th-9th Grade)";
      difficulty = "easy";
    } else if (score >= 50) {
      gradeLevel = "Fairly Difficult (10th-12th Grade)";
      difficulty = "moderate";
    } else if (score >= 30) {
      gradeLevel = "Difficult (College Student)";
      difficulty = "difficult";
    } else {
      gradeLevel = "Very Difficult (Academic/PhD)";
      difficulty = "difficult";
    }

    return { score, gradeLevel, difficulty };
  }

  /**
   * Computes comprehensive editorial metrics and indicators.
   */
  generateInsights(postId: string, post: any): PostInsightsResult {
    const text = post.content || "";
    const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
    const readingTimeMin = Math.max(1, Math.ceil(words / 200));

    // Parse counts from markdown structure
    const headingCount = (text.match(/^#{1,6}\s+/gm) || []).length;
    const imageCount = (text.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const tableCount = (text.match(/\|[-\s:|]+\|/g) || []).length;
    const codeBlockCount = (text.match(/```[\s\S]*?```/g) || []).length;

    // Links parser
    let internal = 0;
    let external = 0;
    const linkRegex = /\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      const href = match[1] || "";
      if (href.startsWith("/") || href.includes("openidear.com")) {
        internal++;
      } else {
        external++;
      }
    }

    const readability = this.calculateReadability(text);

    return {
      postId,
      wordCount: words,
      readingTimeMin,
      imageCount,
      headingCount,
      linkCount: { internal, external },
      tableCount,
      codeBlockCount,
      readability,
    };
  }
}

export const postInsightsManager = new PostInsightsManager();
