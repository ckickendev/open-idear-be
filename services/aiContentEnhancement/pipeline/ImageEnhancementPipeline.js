const aiImagePlannerService = require("../image-planner/AIImagePlannerService");
const assetResolverService = require("../asset-resolver/AssetResolverService");
const { MarkdownEnhancerService: markdownEnhancerService } = require("../markdown-enhancer/MarkdownEnhancerService");
const { mermaidDiagramEnhancementPass } = require("../diagram/MermaidDiagramEnhancementPass");

class ImageEnhancementPass {
  constructor() {
    this.passName = "ImageEnhancementPass";
  }

  async execute(context) {
    const warnings = [];

    // Step 1: Generate ImagePlan
    const plan = await aiImagePlannerService.plan({
      title: context.options.title,
      markdownContent: context.markdown,
      userId: context.userId,
      maxImages: context.options.maxImages || 4,
    });

    if (!plan.suggestions || plan.suggestions.length === 0) {
      warnings.push("Image Planner generated 0 visual suggestions for this article.");
      return {
        stepName: this.passName,
        enhancedMarkdown: context.markdown,
        warnings,
        metadata: {
          insertedImages: [],
          unresolvedImages: [],
          plannedImagesCount: 0,
        },
      };
    }

    // Step 2: Resolve Assets
    const resolutionResult = await assetResolverService.resolve({
      userId: context.userId,
      imagePlan: plan,
      mediaAssetsPool: context.options.customMediaPool,
    });

    if (resolutionResult.unresolvedSuggestions.length > 0) {
      warnings.push(
        `${resolutionResult.unresolvedSuggestions.length} image suggestion(s) could not be resolved from Media Center.`
      );
    }

    // Step 3: Transform Markdown AST
    const enhancementReport = markdownEnhancerService.enhance(
      context.markdown,
      resolutionResult.resolvedAssets,
      { ensureSpacing: true, captionStyle: "none" }
    );

    if (enhancementReport.skippedImageIds.length > 0) {
      warnings.push(
        `${enhancementReport.skippedImageIds.length} resolved image(s) were skipped during AST injection.`
      );
    }

    return {
      stepName: this.passName,
      enhancedMarkdown: enhancementReport.enhancedMarkdown,
      warnings,
      metadata: {
        insertedImages: resolutionResult.resolvedAssets,
        unresolvedImages: resolutionResult.unresolvedSuggestions,
        plannedImagesCount: plan.totalSuggestions,
      },
    };
  }
}

class ContentEnhancementPipeline {
  constructor() {
    this.passes = [
      new ImageEnhancementPass(),
      mermaidDiagramEnhancementPass,
    ];
  }

  registerPass(pass) {
    this.passes.push(pass);
    return this;
  }

  async execute(userId, markdown, options = {}) {
    const startTime = Date.now();
    const warnings = [];

    if (!markdown || typeof markdown !== "string" || !markdown.trim()) {
      return {
        enhancedMarkdown: "",
        insertedAssets: [],
        insertedImages: [],
        unresolvedImages: [],
        insertedDiagrams: [],
        skippedDiagrams: [],
        diagramStatistics: { planned: 0, generated: 0, inserted: 0, skipped: 0 },
        statistics: {
          totalWords: 0,
          totalHeadings: 0,
          plannedImagesCount: 0,
          resolvedImagesCount: 0,
          unresolvedImagesCount: 0,
          executionTimeMs: 0,
        },
        warnings: ["Cannot execute enhancement pipeline on empty markdown document."],
      };
    }

    const totalWords = markdown.trim().split(/\s+/).filter(Boolean).length;
    const totalHeadings = (markdown.match(/^(#{1,6})\s+/mg) || []).length;

    let currentMarkdown = markdown;
    let insertedImages = [];
    let unresolvedImages = [];
    let plannedImagesCount = 0;

    let insertedDiagrams = [];
    let skippedDiagrams = [];
    let diagramStatistics = { planned: 0, generated: 0, inserted: 0, skipped: 0 };

    const context = {
      userId,
      markdown,
      options: { userId, ...options },
      warnings: [],
      metadata: {},
    };

    for (const pass of this.passes) {
      if (pass.passName === "ImageEnhancementPass" && options.enableImageEnhancement === false) {
        continue;
      }
      if (pass.passName === "MermaidDiagramEnhancementPass" && options.enableDiagrams === false) {
        continue;
      }

      try {
        const stepResult = await pass.execute(context);
        currentMarkdown = stepResult.enhancedMarkdown;
        context.markdown = currentMarkdown;

        if (stepResult.warnings && stepResult.warnings.length > 0) {
          warnings.push(...stepResult.warnings);
        }

        if (stepResult.metadata) {
          if (stepResult.metadata.insertedImages) {
            insertedImages = stepResult.metadata.insertedImages;
          }
          if (stepResult.metadata.unresolvedImages) {
            unresolvedImages = stepResult.metadata.unresolvedImages;
          }
          if (typeof stepResult.metadata.plannedImagesCount === "number") {
            plannedImagesCount = stepResult.metadata.plannedImagesCount;
          }
          if (stepResult.metadata.insertedDiagrams) {
            insertedDiagrams = stepResult.metadata.insertedDiagrams;
          }
          if (stepResult.metadata.skippedDiagrams) {
            skippedDiagrams = stepResult.metadata.skippedDiagrams;
          }
          if (stepResult.metadata.diagramStatistics) {
            diagramStatistics = stepResult.metadata.diagramStatistics;
          }
        }
      } catch (err) {
        const passErrorMsg = `[${pass.passName}] Failed to execute pass: ${err.message}`;
        console.error(passErrorMsg);
        warnings.push(passErrorMsg);
      }
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      enhancedMarkdown: currentMarkdown,
      insertedAssets: insertedImages,
      insertedImages,
      unresolvedImages,
      insertedDiagrams,
      skippedDiagrams,
      diagramStatistics,
      statistics: {
        totalWords,
        totalHeadings,
        plannedImagesCount,
        resolvedImagesCount: insertedImages.length,
        unresolvedImagesCount: unresolvedImages.length,
        executionTimeMs,
      },
      warnings,
      executionTimeMs,
    };
  }
}

module.exports = new ContentEnhancementPipeline();
