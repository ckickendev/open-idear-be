const contentAnalyzer = require("./contentAnalyzer");
const assetResolver = require("./assetResolver");
const markdownEnhancer = require("./markdownEnhancer");
const imagePlannerPlugin = require("./plugins/imagePlannerPlugin");
const mediaAssetService = require("../mediaAsset.services");

class EnhancementPipeline {
  constructor() {
    this.plugins = [imagePlannerPlugin];
  }

  /**
   * Registers a new plugin instance into the pipeline (supports FAQ, Table, Mermaid, Links).
   * @param {Object} plugin
   */
  registerPlugin(plugin) {
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  /**
   * Executes the full enhancement pipeline on a document.
   * @param {string} userId
   * @param {string} rawMarkdown
   * @param {Object} [options]
   * @returns {Promise<import('./types').EnhancementResult>}
   */
  async execute(userId, rawMarkdown, options = {}) {
    const startTime = Date.now();

    if (!rawMarkdown || typeof rawMarkdown !== "string" || !rawMarkdown.trim()) {
      return {
        enhancedMarkdown: "",
        insertedAssets: [],
        appliedEnhancements: [],
        executionTimeMs: 0,
      };
    }

    // 1. Content Analysis Pass
    const context = await contentAnalyzer.analyze(rawMarkdown);

    // 2. Planning Pass across plugins
    const allIntents = [];
    for (const plugin of this.plugins) {
      // Check feature flags if provided in options
      if (options[plugin.pluginId] === false) continue;

      try {
        const intents = await plugin.plan(context);
        if (Array.isArray(intents)) {
          allIntents.push(...intents);
        }
      } catch (err) {
        console.warn(`[EnhancementPipeline] Plugin '${plugin.pluginId}' error:`, err.message);
      }
    }

    // 3. Asset & Placement Resolution Pass
    const resolvedPlacements = await assetResolver.resolve(userId, allIntents);

    // 4. Markdown Enhancement AST Pass
    const { enhancedMarkdown, appliedLog } = markdownEnhancer.enhance(context, resolvedPlacements);

    // 5. Track media usage for resolved assets with mediaId
    resolvedPlacements.forEach((placement) => {
      if (placement.mediaId && options.postId) {
        try {
          mediaAssetService.addUsage(placement.mediaId, "post", options.postId, "content");
        } catch (err) {
          console.warn(`[EnhancementPipeline] Failed to add media usage for ${placement.mediaId}:`, err.message);
        }
      }
    });

    const executionTimeMs = Date.now() - startTime;

    return {
      enhancedMarkdown,
      insertedAssets: resolvedPlacements,
      appliedEnhancements: appliedLog,
      executionTimeMs,
    };
  }
}

module.exports = new EnhancementPipeline();
