import type { ArticleBlock } from "../../content/contentStructure.service";
import type { PublisherSEOOutput } from "./publisherSEO.schema";

export interface ValidationResult {
  score: number;
  passed: boolean;
  issues: string[];
  metrics: {
    wordCount: number;
    hasFAQ: boolean;
    hasCTA: boolean;
    h1Count: number;
    metaDescLength: number;
  };
}

export interface ValidatorInput {
  blocks: ArticleBlock[];
  seo: PublisherSEOOutput;
  wordCount: number;
  title: string;
}

export class PublisherValidatorAgent {
  readonly name = "PublisherValidatorAgent";

  public validate(input: ValidatorInput): ValidationResult {
    const issues: string[] = [];
    let score = 100;

    // 1. Check H1 count in blocks (H1 in body blocks is prohibited; H1 should only be title)
    const h1Blocks = input.blocks.filter(
      (b) => b.type === "heading" && (b as any).level === 1
    );
    const h1Count = h1Blocks.length;
    if (h1Count > 0) {
      issues.push(`Found ${h1Count} H1 heading(s) in body blocks. Heading level 1 is reserved for article title.`);
      score -= 15;
    }

    // 2. Check meta description length (≤ 160 chars)
    const metaDescLength = input.seo?.metaDescription?.length || 0;
    if (metaDescLength > 160) {
      issues.push(`Meta description exceeds 160 characters (${metaDescLength} chars).`);
      score -= 20;
    } else if (metaDescLength === 0) {
      issues.push("Meta description is missing.");
      score -= 25;
    }

    // 3. Check minimum word count (1200 words)
    const wordCount = input.wordCount || 0;
    if (wordCount < 1200) {
      issues.push(`Article length is ${wordCount} words, which is under the 1,200 word minimum requirement.`);
      score -= 25;
    }

    // 4. Check FAQ block existence
    const hasFAQ = input.blocks.some((b) => b.type === "faq") || 
      input.blocks.some((b) => b.type === "heading" && (b as any).content?.toLowerCase().includes("faq"));
    if (!hasFAQ) {
      issues.push("Article is missing a Frequently Asked Questions (FAQ) section.");
      score -= 20;
    }

    // 5. Check CTA block existence
    const hasCTA = input.blocks.some((b) => b.type === "cta" || b.type === "callout");
    if (!hasCTA) {
      issues.push("Article is missing a Call-To-Action (CTA) or summary section.");
      score -= 20;
    }

    score = Math.max(0, score);
    const passed = score >= 70 && issues.length <= 2;

    return {
      score,
      passed,
      issues,
      metrics: {
        wordCount,
        hasFAQ,
        hasCTA,
        h1Count,
        metaDescLength,
      },
    };
  }
}
