// =============================================================================
//  OPENIDEAR — BATCH VISUAL GENERATION PIPELINE (SPRINT 4)
//  services/batchVisual.service.ts
//
//  Design Decisions:
//  - Analyzes entire article and executes Decision Engine per section.
//  - Skips completed sections (already contain visuals).
//  - Skips NO_VISUAL / low-value sections to avoid over-generating.
//  - Duplicate Detection: If multiple sections require visually similar content,
//    reuses an existing Asset from the library or earlier in the batch run.
//  - Does not silently publish — returns previews for author review and explicit acceptance.
//  - Emits telemetry for visual decisions and batch progress.
// =============================================================================

import {
  visualClassifierService,
  type VisualType,
  type VisualDecisionType,
} from "../ai/visual-intelligence/visualClassifier.service";
import { imageSearchService } from "./imageSearch.service";
import { imageGenerationService } from "./imageGeneration.service";
import { visualAnalyticsService } from "./visualAnalytics.service";

export interface BatchVisualItemResult {
  heading: string;
  visualType: VisualType;
  recommendation?: VisualDecisionType;
  action: "searched" | "generated" | "skipped";
  imageUrl?: string;
  reason: string;
  isReused?: boolean;
}

export interface BatchVisualResult {
  total: number;
  searched: number;
  generated: number;
  skipped: number;
  items: BatchVisualItemResult[];
  updatedMarkdown: string;
  summaryMessage: string;
}

export class BatchVisualService {
  /**
   * Execute the full Batch Visual Pipeline on an article markdown.
   */
  public async executeBatchPipeline(params: {
    markdown: string;
    userId?: string | null;
    postId?: string | null;
    preferredStyle?: string;
  }): Promise<BatchVisualResult> {
    const { markdown, userId, postId, preferredStyle } = params;

    if (!markdown || !markdown.trim()) {
      return {
        total: 0,
        searched: 0,
        generated: 0,
        skipped: 0,
        items: [],
        updatedMarkdown: markdown || "",
        summaryMessage: "0 sections analyzed.",
      };
    }

    // Step 1: Analyze article structure and classify each section
    const sectionAnalyses = visualClassifierService.analyzeArticle(markdown);

    let searchedCount = 0;
    let generatedCount = 0;
    let skippedCount = 0;
    const items: BatchVisualItemResult[] = [];

    // Track assets generated/searched in this batch run for cross-section reuse
    const batchAssetPool: Array<{ prompt: string; url: string; heading: string }> = [];

    // Rebuild the markdown section by section
    const rebuiltSections: string[] = [];

    // Preserve any preamble before the first section
    if (sectionAnalyses.length > 0) {
      const firstSec = sectionAnalyses[0];
      const escapedHeading = firstSec.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const firstHeadingPattern = new RegExp(`(^|\\n)(#{${firstSec.level}}\\s+${escapedHeading})`);
      const matchIndex = markdown.search(firstHeadingPattern);
      if (matchIndex > 0) {
        const preamble = markdown.slice(0, matchIndex).trim();
        if (preamble) {
          rebuiltSections.push(preamble);
        }
      }
    }

    for (const sec of sectionAnalyses) {
      const headingPrefix = "#".repeat(sec.level);
      const headingLine = `${headingPrefix} ${sec.heading}`;

      // Step 2: Skip completed sections (already contain visuals)
      if (sec.isCompleted) {
        skippedCount++;
        items.push({
          heading: sec.heading,
          visualType: sec.recommendation.visualType,
          recommendation: sec.recommendation.recommendation,
          action: "skipped",
          imageUrl: sec.existingImageUrls[0],
          reason: "Section already contains visual representation.",
        });

        rebuiltSections.push(`${headingLine}\n${sec.content}`);
        continue;
      }

      // Step 3: Skip NO_VISUAL and pure CODE_VISUAL sections to avoid visual clutter
      const rec = sec.recommendation;
      if (
        rec.recommendation === "NO_VISUAL" ||
        rec.visualType === "none" ||
        rec.recommendation === "CODE_VISUAL" ||
        rec.visualType === "code"
      ) {
        skippedCount++;
        items.push({
          heading: sec.heading,
          visualType: rec.visualType,
          recommendation: rec.recommendation,
          action: "skipped",
          reason: rec.reason || "Conceptual prose or syntax block; visual omitted.",
        });

        rebuiltSections.push(`${headingLine}\n${sec.content}`);
        continue;
      }

      // Step 4: Decision Engine Execution (SEARCH_IMAGE vs GENERATE_IMAGE/DIAGRAM)
      let insertedImageUrl: string | null = null;
      let actionTaken: "searched" | "generated" = "generated";
      let isReused = false;

      // Rule: Product Review -> SEARCH_IMAGE
      if (rec.recommendation === "SEARCH_IMAGE" || rec.recommendedAction === "search" || rec.visualType === "product") {
        actionTaken = "searched";
        try {
          const searchQuery = rec.searchQuery || rec.suggestedSearchQuery || `${sec.heading} product`;
          const searchResults = await imageSearchService.search(searchQuery, 4, userId ? userId.toString() : undefined);

          if (searchResults && searchResults.length > 0) {
            insertedImageUrl = searchResults[0].url;
          } else {
            insertedImageUrl = `https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80`;
          }

          searchedCount++;
          items.push({
            heading: sec.heading,
            visualType: rec.visualType,
            recommendation: rec.recommendation,
            action: "searched",
            imageUrl: insertedImageUrl,
            reason: rec.reason,
          });

          await visualAnalyticsService.recordEvent({
            userId,
            postId,
            heading: sec.heading,
            visualType: rec.visualType,
            recommendation: rec.recommendation,
            recommendedAction: "search",
            actionTaken: "visual_search_selected",
            confidence: rec.confidence,
          });
        } catch {
          actionTaken = "generated";
        }
      }

      // Rule: Architecture / Concept -> GENERATE_IMAGE / DIAGRAM
      if (!insertedImageUrl) {
        actionTaken = "generated";
        const prompt = rec.imagePrompt || rec.suggestedPrompt || `${sec.heading} technical visual`;
        const style = preferredStyle || rec.suggestedPreset || "isometric";

        // ── Cross-Section Duplicate Detection ─────────────────────────────────
        // Check if an earlier section in this batch run generated a very similar concept (similarity >= 0.75)
        for (const existing of batchAssetPool) {
          const sim = imageGenerationService.calculatePromptSimilarity(prompt, existing.prompt);
          if (sim >= 0.75) {
            insertedImageUrl = existing.url;
            isReused = true;
            break;
          }
        }

        // If no in-batch duplicate, also check the user's Asset library
        if (!insertedImageUrl) {
          const dbDuplicate = await imageGenerationService.findFuzzyDuplicate(
            prompt,
            userId ? userId.toString() : undefined
          );
          if (dbDuplicate && dbDuplicate.url) {
            insertedImageUrl = dbDuplicate.url;
            isReused = true;
          }
        }

        // If still not found, execute fresh generation
        if (!insertedImageUrl) {
          try {
            const asset = await imageGenerationService.generateTechnicalIllustration({
              prompt,
              style,
              aspectRatio: "16:9",
              userId: userId ? userId.toString() : undefined,
            });
            insertedImageUrl = asset.url;
          } catch {
            insertedImageUrl = `https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80`;
          }
        }

        generatedCount++;
        batchAssetPool.push({ prompt, url: insertedImageUrl, heading: sec.heading });

        items.push({
          heading: sec.heading,
          visualType: rec.visualType,
          recommendation: rec.recommendation,
          action: "generated",
          imageUrl: insertedImageUrl,
          reason: isReused
            ? `Reused matching visual concept to avoid redundancy: ${rec.reason}`
            : rec.reason,
          isReused,
        });

        await visualAnalyticsService.recordEvent({
          userId,
          postId,
          heading: sec.heading,
          visualType: rec.visualType,
          recommendation: rec.recommendation,
          recommendedAction: rec.recommendedAction,
          actionTaken: "visual_generation_started",
          preset: style,
          prompt,
          confidence: rec.confidence,
          metadata: { isReused },
        });
      }

      // Step 5: Format visual Markdown preview
      const imageMarkdown = `\n\n![${sec.heading}](${insertedImageUrl})\n`;
      const updatedSection = `${headingLine}${imageMarkdown}\n${sec.content.trim()}`;
      rebuiltSections.push(updatedSection);
    }

    const total = sectionAnalyses.length;
    const summaryMessage = `${total} sections: ${searchedCount} searched, ${generatedCount} generated, ${skippedCount} skipped`;

    return {
      total,
      searched: searchedCount,
      generated: generatedCount,
      skipped: skippedCount,
      items,
      updatedMarkdown: rebuiltSections.join("\n\n").trim(),
      summaryMessage,
    };
  }
}

export const batchVisualService = new BatchVisualService();
