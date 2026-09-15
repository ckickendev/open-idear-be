import { aiLogger } from "../telemetry";
import {
  generateDescription,
  suggestTags,
  detectCategory,
  generateSlug,
  calculateReadTime,
  validateSEO,
} from "./smartPublish.tasks";
import type { SmartPublishResult, CoverImageSuggestion } from "./smartPublish.schema";

const assetResolverService = require("../../services/aiContentEnhancement/asset-resolver/AssetResolverService");

/**
 * =============================================================================
 *  SMART PUBLISH WORKFLOW
 *  ai/workflow/smartPublish.workflow.ts
 *
 *  Design Decisions:
 *  - Composes independent AI tasks via Promise.allSettled() for concurrent execution.
 *  - Returns partial results even when individual tasks fail (resilient UX).
 *  - Cover image resolution reuses existing AssetResolverService infrastructure.
 *  - Non-AI utility tasks run synchronously after AI tasks settle.
 *  - Total workflow time ≈ max(AI task durations) + ~50ms utility overhead.
 * =============================================================================
 */

interface SmartPublishWorkflowInput {
  readonly title: string;
  readonly content: string;
  readonly userId: string;
  readonly signal?: AbortSignal;
}

interface TaskError {
  taskName: string;
  error: string;
}

export class SmartPublishWorkflow {
  /**
   * Executes the complete Smart Publish workflow.
   * Runs AI tasks concurrently and utility tasks synchronously.
   */
  async execute(input: SmartPublishWorkflowInput): Promise<SmartPublishResult> {
    const startTime = Date.now();
    const taskErrors: TaskError[] = [];

    let description: string | null = null;
    let tags: string[] | null = null;
    let suggestedCategory: SmartPublishResult["suggestedCategory"] = null;
    let slug: string | null = null;
    let readTimeMinutes: number | null = null;
    let coverImage: CoverImageSuggestion | null = null;
    let seoValidation: SmartPublishResult["seoValidation"] = null;

    // ── Phase 1: Concurrent AI Tasks ──────────────────────────────────────

    const [descResult, tagsResult, categoryResult] = await Promise.allSettled([
      generateDescription(input.title, input.content, input.signal),
      suggestTags(input.title, input.content, input.signal),
      detectCategory(input.title, input.content, input.signal),
    ]);

    // Collect description
    if (descResult.status === "fulfilled") {
      description = descResult.value.description;
    } else {
      taskErrors.push({
        taskName: "description",
        error: descResult.reason?.message || "Description generation failed",
      });
    }

    // Collect tags
    if (tagsResult.status === "fulfilled") {
      tags = tagsResult.value.tags;
    } else {
      taskErrors.push({
        taskName: "tags",
        error: tagsResult.reason?.message || "Tag suggestion failed",
      });
    }

    // Collect category
    if (categoryResult.status === "fulfilled") {
      suggestedCategory = categoryResult.value.suggestedCategory;
    } else {
      taskErrors.push({
        taskName: "category",
        error: categoryResult.reason?.message || "Category detection failed",
      });
    }

    // ── Phase 2: Deterministic Utility Tasks ──────────────────────────────

    // Slug generation
    try {
      slug = await generateSlug(input.title);
    } catch (err: any) {
      taskErrors.push({
        taskName: "slug",
        error: err.message || "Slug generation failed",
      });
    }

    // Read time calculation
    try {
      readTimeMinutes = calculateReadTime(input.content);
    } catch (err: any) {
      taskErrors.push({
        taskName: "readTime",
        error: err.message || "Read time calculation failed",
      });
    }

    // ── Phase 3: Cover Image Resolution ───────────────────────────────────

    try {
      coverImage = await this.resolveCoverImage(
        input.userId,
        input.title,
        description
      );
    } catch (err: any) {
      taskErrors.push({
        taskName: "coverImage",
        error: err.message || "Cover image resolution failed",
      });
    }

    // ── Phase 4: SEO Validation ───────────────────────────────────────────

    try {
      seoValidation = validateSEO({
        title: input.title,
        description,
        slug,
        content: input.content,
      });
    } catch (err: any) {
      taskErrors.push({
        taskName: "seoValidation",
        error: err.message || "SEO validation failed",
      });
    }

    // ── Telemetry ─────────────────────────────────────────────────────────

    const durationMs = Date.now() - startTime;

    await aiLogger.log({
      providerId: "smart-publish-workflow",
      model: "workflow",
      prompt: { system: "SmartPublishWorkflow", messages: [] },
      durationMs,
      response: JSON.stringify({
        hasDescription: !!description,
        hasTags: !!tags,
        hasCategory: !!suggestedCategory,
        hasSlug: !!slug,
        hasCover: !!coverImage,
        taskErrorCount: taskErrors.length,
      }),
      promptName: "smart-publish",
      promptVersion: "v1",
    });

    return {
      description,
      tags,
      suggestedCategory,
      slug,
      readTimeMinutes,
      coverImage,
      seoValidation,
      taskErrors,
    };
  }

  /**
   * Resolves a cover image using existing AssetResolverService.
   * Creates a synthetic single-suggestion image plan from the title.
   */
  private async resolveCoverImage(
    userId: string,
    title: string,
    description: string | null
  ): Promise<CoverImageSuggestion | null> {
    const searchQuery = description
      ? `${title} ${description}`.slice(0, 100)
      : title;

    const syntheticPlan = {
      suggestions: [
        {
          position: 0,
          query: searchQuery,
          alt: `Cover image for: ${title}`,
          heading: title,
        },
      ],
      totalSuggestions: 1,
    };

    const resolution = await assetResolverService.resolve({
      userId,
      imagePlan: syntheticPlan,
    });

    if (resolution.resolvedAssets.length > 0) {
      const asset = resolution.resolvedAssets[0];
      return {
        url: asset.url,
        alt: asset.alt || `Cover image for: ${title}`,
        mediaId: asset.mediaId,
        provider: asset.provider || "local",
        previewUrl: asset.previewUrl,
      };
    }

    return null;
  }
}

export const smartPublishWorkflow = new SmartPublishWorkflow();
