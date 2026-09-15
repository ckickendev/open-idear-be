// =============================================================================
//  CONTENT STRUCTURE SERVICE
//  ai/content/contentStructure.service.ts
//
//  Design Decisions:
//  - Fully deterministic backend service (NO LLM calls).
//  - Converts raw Markdown articles and Growth Results into structured ArticleBlock[].
//  - Assigns stable UUIDs and sequential `order` numbers to every block.
//  - Supports callout detection from blockquotes (> **Tip:** ...).
//  - Supports FAQ and Comparison Table injection from Growth Workflow results.
// =============================================================================

import { marked } from "marked";
import { v4 as uuidv4 } from "uuid";

// ─── Block Interfaces ─────────────────────────────────────────────────────────

export interface BaseBlock {
  id: string;
  type: string;
  order: number;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  content: string;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  level: 2 | 3;
  content: string;
}

export interface ListBlock extends BaseBlock {
  type: "list";
  style: "unordered" | "ordered";
  items: string[];
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface CodeBlock extends BaseBlock {
  type: "code";
  language?: string;
  code: string;
  filename?: string;
}

export interface CalloutBlock extends BaseBlock {
  type: "callout";
  variant: "info" | "tip" | "warning" | "caution";
  title?: string;
  content: string;
}

export interface QuoteBlock extends BaseBlock {
  type: "quote";
  content: string;
  author?: string;
  source?: string;
}

export interface ComparisonRow {
  cells: string[];
}

export interface ComparisonBlock extends BaseBlock {
  type: "comparison";
  title?: string;
  columns: string[];
  rows: ComparisonRow[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQBlock extends BaseBlock {
  type: "faq";
  title?: string;
  items: FAQItem[];
}

export interface CTAButton {
  label: string;
  href: string;
}

export interface CTABlock extends BaseBlock {
  type: "cta";
  title: string;
  description?: string;
  button: CTAButton;
  variant?: "primary" | "secondary";
}

export type ArticleBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | ImageBlock
  | CodeBlock
  | CalloutBlock
  | QuoteBlock
  | ComparisonBlock
  | FAQBlock
  | CTABlock;

export type DraftBlock =
  | Omit<ParagraphBlock, "id" | "order">
  | Omit<HeadingBlock, "id" | "order">
  | Omit<ListBlock, "id" | "order">
  | Omit<ImageBlock, "id" | "order">
  | Omit<CodeBlock, "id" | "order">
  | Omit<CalloutBlock, "id" | "order">
  | Omit<QuoteBlock, "id" | "order">
  | Omit<ComparisonBlock, "id" | "order">
  | Omit<FAQBlock, "id" | "order">
  | Omit<CTABlock, "id" | "order">;

export interface StructureServiceInput {
  markdown?: string | null;
  growthResults?: {
    faq?: { faqs?: FAQItem[]; title?: string } | FAQItem[] | any;
    faqs?: { faqs?: FAQItem[]; title?: string } | FAQItem[] | any;
    comparisonTable?: { title?: string; headers?: string[]; rows?: string[][] | { cells: string[] }[] } | any;
    comparison?: any;
    [key: string]: any;
  } | null;
}

export interface StructureServiceOutput {
  blocks: ArticleBlock[];
  contentVersion: "blocks-v1";
}

// ─── ContentStructureService Class ──────────────────────────────────────────

export class ContentStructureService {
  /**
   * Main entry point: converts Markdown + optional Growth Results into ArticleBlock[].
   */
  public static buildArticleStructure(input: StructureServiceInput): StructureServiceOutput {
    const rawMarkdown = input.markdown || "";
    const growthResults = input.growthResults || null;

    const rawBlocks: DraftBlock[] = [];

    if (rawMarkdown.trim()) {
      const parsed = ContentStructureService.parseMarkdown(rawMarkdown);
      rawBlocks.push(...parsed);
    }

    // Inject Growth Results if present
    if (growthResults) {
      // Comparison Table injection
      const compTable = growthResults.comparisonTable || growthResults.comparison;
      if (compTable) {
        const compBlock = ContentStructureService.convertGrowthComparison(compTable);
        if (compBlock) {
          rawBlocks.push(compBlock);
        }
      }

      // FAQ injection
      const faqData = growthResults.faq || growthResults.faqs;
      if (faqData) {
        const faqBlock = ContentStructureService.convertGrowthFAQ(faqData);
        if (faqBlock) {
          rawBlocks.push(faqBlock);
        }
      }
    }

    // Assign IDs and order numbers
    const blocks: ArticleBlock[] = rawBlocks.map((block, index) => ({
      ...block,
      id: uuidv4(),
      order: index,
    })) as ArticleBlock[];

    return {
      blocks,
      contentVersion: "blocks-v1",
    };
  }

  /**
   * Converts Markdown text into unindexed ArticleBlock objects.
   */
  private static parseMarkdown(markdown: string): DraftBlock[] {
    const tokens = marked.lexer(markdown);
    const blocks: DraftBlock[] = [];

    for (const token of tokens) {
      switch (token.type) {
        case "heading": {
          const level = token.depth === 2 ? 2 : 3; // Normalize H1/H2->2, H3/H4+->3
          blocks.push({
            type: "heading",
            level,
            content: ContentStructureService.cleanInlineText(token.text),
          });
          break;
        }

        case "paragraph": {
          // Check if paragraph is an image
          if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === "image") {
            const imgToken = token.tokens[0] as any;
            blocks.push({
              type: "image",
              src: imgToken.href || "",
              alt: imgToken.text || "Article image",
              ...(imgToken.title ? { caption: imgToken.title } : {}),
            });
          } else {
            blocks.push({
              type: "paragraph",
              content: ContentStructureService.cleanInlineText(token.text),
            });
          }
          break;
        }

        case "code": {
          blocks.push({
            type: "code",
            ...(token.lang ? { language: token.lang } : {}),
            code: token.text,
          });
          break;
        }

        case "list": {
          const listToken = token as any;
          const items = (listToken.items || []).map((item: any) =>
            ContentStructureService.cleanInlineText(item.text || "")
          );
          blocks.push({
            type: "list",
            style: listToken.ordered ? "ordered" : "unordered",
            items,
          });
          break;
        }

        case "blockquote": {
          const bqText = ContentStructureService.cleanInlineText(token.text);
          const calloutMatch = ContentStructureService.matchCalloutPattern(bqText);

          if (calloutMatch) {
            blocks.push({
              type: "callout",
              variant: calloutMatch.variant,
              ...(calloutMatch.title ? { title: calloutMatch.title } : {}),
              content: calloutMatch.content,
            });
          } else {
            blocks.push({
              type: "quote",
              content: bqText,
            });
          }
          break;
        }

        case "table": {
          const tableToken = token as any;
          const columns = (tableToken.header || []).map((col: any) =>
            ContentStructureService.cleanInlineText(typeof col === "string" ? col : col.text || "")
          );
          const rows = (tableToken.rows || []).map((row: any[]) => ({
            cells: row.map((cell: any) =>
              ContentStructureService.cleanInlineText(typeof cell === "string" ? cell : cell.text || "")
            ),
          }));

          blocks.push({
            type: "comparison",
            columns,
            rows,
          });
          break;
        }

        default:
          // Skip unsupported top-level tokens (e.g., space, hr)
          break;
      }
    }

    return blocks;
  }

  /**
   * Helper: Matches blockquote text against Callout patterns like:
   * > **Tip:** Use 64GB RAM.
   * > **Warning:** ...
   * > **Caution:** ...
   * > **Info:** or > **Note:** ...
   */
  private static matchCalloutPattern(text: string): {
    variant: "info" | "tip" | "warning" | "caution";
    title?: string;
    content: string;
  } | null {
    const trimmed = text.trim();

    // Regex matching prefixes like "**Tip:**", "**Warning:**", "**Note:**", "[!TIP]", "[!WARNING]"
    const pattern = /^(?:\*\*|\[!)(Tip|Warning|Caution|Info|Note)(?:\:\*\*|\:\s*|\s*\])\s*(.*)/i;
    const match = trimmed.match(pattern);

    if (!match) return null;

    const keyword = match[1].toLowerCase();
    const body = match[2].trim();

    let variant: "info" | "tip" | "warning" | "caution" = "info";
    if (keyword === "tip") variant = "tip";
    else if (keyword === "warning") variant = "warning";
    else if (keyword === "caution") variant = "caution";
    else if (keyword === "info" || keyword === "note") variant = "info";

    const title = keyword.charAt(0).toUpperCase() + keyword.slice(1);

    return {
      variant,
      title,
      content: body || trimmed,
    };
  }

  /**
   * Helper: Converts Growth ComparisonTableResult into ComparisonBlock.
   */
  private static convertGrowthComparison(compTable: any): DraftBlock | null {
    if (!compTable) return null;

    const title = compTable.title;
    const headers: string[] = compTable.headers || compTable.columns || [];
    const rawRows = compTable.rows || [];

    if (!Array.isArray(headers) || headers.length === 0) return null;

    const rows: ComparisonRow[] = rawRows.map((r: any) => {
      if (Array.isArray(r)) {
        return { cells: r.map((c) => String(c)) };
      }
      if (r && Array.isArray(r.cells)) {
        return { cells: r.cells.map((c: any) => String(c)) };
      }
      if (r && typeof r === "object") {
        return { cells: Object.values(r).map((c: any) => String(c)) };
      }
      return { cells: [String(r)] };
    });

    return {
      type: "comparison",
      ...(title ? { title: String(title) } : {}),
      columns: headers,
      rows,
    };
  }

  /**
   * Helper: Converts Growth FAQResult into FAQBlock.
   */
  private static convertGrowthFAQ(faqData: any): DraftBlock | null {
    if (!faqData) return null;

    const title = faqData.title || "Frequently Asked Questions";
    const rawFaqs = Array.isArray(faqData) ? faqData : faqData.faqs || faqData.items || [];

    if (!Array.isArray(rawFaqs) || rawFaqs.length === 0) return null;

    const items: FAQItem[] = rawFaqs
      .filter((item) => item && (item.question || item.q))
      .map((item) => ({
        question: String(item.question || item.q || "").trim(),
        answer: String(item.answer || item.a || "").trim(),
      }));

    if (items.length === 0) return null;

    return {
      type: "faq",
      title: String(title),
      items,
    };
  }

  /**
   * Clean inline text by stripping HTML tags if necessary while leaving text intact.
   */
  private static cleanInlineText(text: string): string {
    if (!text) return "";
    return text.trim();
  }
}
