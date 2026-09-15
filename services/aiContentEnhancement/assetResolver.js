const aiSuggestionService = require("../aiSuggestion.services");
const aiSemanticSearchService = require("../aiSemanticSearch.services");

class AssetResolver {
  /**
   * Resolves a list of EnhancementIntents into concrete markdown insertion payloads.
   * @param {string} userId
   * @param {import('./types').EnhancementIntent[]} intents
   * @returns {Promise<import('./types').ResolvedPlacement[]>}
   */
  async resolve(userId, intents) {
    if (!intents || intents.length === 0) {
      return [];
    }

    const resolved = [];

    for (const intent of intents) {
      if (intent.type === "image") {
        try {
          const placement = await this._resolveImage(userId, intent);
          if (placement) {
            resolved.push(placement);
          }
        } catch (err) {
          console.warn(`[AssetResolver] Failed to resolve image intent ${intent.id}:`, err.message);
        }
      }
    }

    return resolved;
  }

  /**
   * Resolves an individual image placement intent using Local Library first, then Unified Stock Search.
   */
  async _resolveImage(userId, intent) {
    const query = intent.searchQuery || "technology";

    // 1. Check local media library first
    const localSuggestions = await aiSuggestionService.suggestImages(userId, query);
    if (localSuggestions && localSuggestions.length > 0) {
      const topLocal = localSuggestions[0];
      const imgUrl = topLocal.urls?.webp || topLocal.urls?.original || topLocal.url;
      if (imgUrl) {
        return {
          id: intent.id,
          type: "image",
          insertAfterIndex: intent.insertAfterIndex,
          url: imgUrl,
          altText: topLocal.altText || intent.altText || topLocal.originalFilename || "Image",
          mediaId: topLocal._id ? topLocal._id.toString() : undefined,
          content: `![${topLocal.altText || intent.altText || "Image"}](${imgUrl})`,
        };
      }
    }

    // 2. Fallback to AI Unified Stock Search (Unsplash/Pexels)
    const stockResults = await aiSemanticSearchService.search(userId, query, 1, 5);
    if (stockResults && stockResults.length > 0) {
      const topStock = stockResults[0];
      const imgUrl = topStock.url || topStock.previewUrl;
      if (imgUrl) {
        return {
          id: intent.id,
          type: "image",
          insertAfterIndex: intent.insertAfterIndex,
          url: imgUrl,
          altText: topStock.alt || intent.altText || "Stock Image",
          content: `![${topStock.alt || intent.altText || "Stock Image"}](${imgUrl})`,
        };
      }
    }

    return null;
  }
}

module.exports = new AssetResolver();
