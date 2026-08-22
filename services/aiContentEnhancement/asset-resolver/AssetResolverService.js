const mongoose = require("mongoose");
const { MediaAsset } = require("../../../models");
const aiSuggestionService = require("../../aiSuggestion.services");
const aiSemanticSearchService = require("../../aiSemanticSearch.services");

class AssetResolverService {
  /**
   * Resolves an ImagePlan against user Media Center assets and fallback stock search.
   * Matches candidate assets by tags, filename, alt text, and description.
   * Prefers exact tag matches over fuzzy string matches and never invents fake URLs.
   * @param {Object} input
   * @param {string} input.userId
   * @param {import('../schemas').ImagePlan} input.imagePlan
   * @param {Array} [input.mediaAssetsPool]
   * @param {number} [input.minScoreThreshold]
   */
  async resolve(input) {
    const {
      userId,
      imagePlan,
      mediaAssetsPool,
      minScoreThreshold = 15,
    } = input;

    if (!imagePlan || !imagePlan.suggestions || imagePlan.suggestions.length === 0) {
      return {
        resolvedAssets: [],
        unresolvedSuggestions: [],
        totalEvaluatedAssets: 0,
      };
    }

    // 1. Fetch user Media Center assets (using preloaded pool or querying MongoDB)
    const availableAssets = mediaAssetsPool || (await this.fetchUserAssets(userId));
    const usedAssetIds = new Set();

    const resolvedAssets = [];
    const unresolvedSuggestions = [];

    // 2. Iterate through suggestions and rank candidates
    for (let i = 0; i < imagePlan.suggestions.length; i++) {
      const suggestion = imagePlan.suggestions[i];
      const suggestionId = `suggestion_${suggestion.position}_${i}`;

      let bestCandidate = this.findBestMatchingAsset({
        suggestion,
        availableAssets,
        usedAssetIds,
        minScoreThreshold,
      });

      if (bestCandidate) {
        const asset = bestCandidate.asset;
        const validUrl = this.extractValidUrl(asset);

        if (validUrl) {
          usedAssetIds.add(asset._id.toString());

          const altText = suggestion.alt || asset.altText || asset.originalFilename || "Article Image";
          const markdownSnippet = `![${altText}](${validUrl})`;

          resolvedAssets.push({
            id: `resolved_${asset._id}_${suggestion.position}`,
            suggestionId,
            position: suggestion.position,
            url: validUrl,
            previewUrl: asset.urls?.thumbnail_md || asset.urls?.thumbnail_sm || validUrl,
            alt: altText,
            caption: asset.description || undefined,
            provider: "local",
            mediaId: asset._id.toString(),
            dimensions: asset.dimensions
              ? {
                  width: asset.dimensions.width || 800,
                  height: asset.dimensions.height || 600,
                }
              : undefined,
            markdownSnippet,
          });
          continue;
        }
      }

      // 3. Fallback: Search stock photos via aiSemanticSearchService if local asset not found
      try {
        const stockResults = await aiSemanticSearchService.search(userId, suggestion.query, 1, 3);
        if (stockResults && stockResults.length > 0) {
          const topStock = stockResults[0];
          const stockUrl = topStock.url || topStock.previewUrl;
          if (stockUrl) {
            const altText = suggestion.alt || topStock.alt || "Stock Photo";
            resolvedAssets.push({
              id: `resolved_stock_${Date.now()}_${suggestion.position}`,
              suggestionId,
              position: suggestion.position,
              url: stockUrl,
              previewUrl: topStock.previewUrl || stockUrl,
              alt: altText,
              provider: topStock.provider || "unsplash",
              markdownSnippet: `![${altText}](${stockUrl})`,
            });
            continue;
          }
        }
      } catch (stockErr) {
        console.warn(`[AssetResolverService] Stock photo fallback warning for '${suggestion.query}':`, stockErr.message);
      }

      // If no suitable match with a valid URL was found, add to unresolved list
      unresolvedSuggestions.push(suggestion);
    }

    return {
      resolvedAssets,
      unresolvedSuggestions,
      totalEvaluatedAssets: availableAssets.length,
    };
  }

  /**
   * Reuses existing MediaCenter DB logic to fetch all valid active assets for a user.
   */
  async fetchUserAssets(userId) {
    try {
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return [];
      }
      return await MediaAsset.find({
        user: userId,
        del_flag: 0,
      })
        .sort({ updatedAt: -1 })
        .lean();
    } catch (err) {
      console.error("[AssetResolverService] Error fetching user assets:", err.message);
      return [];
    }
  }

  /**
   * Evaluates and ranks candidate assets for an individual ImageSuggestion.
   */
  findBestMatchingAsset(params) {
    const { suggestion, availableAssets, usedAssetIds, minScoreThreshold } = params;

    const queryKeywords = suggestion.query
      .toLowerCase()
      .split(/\s+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);

    const candidates = [];

    for (const asset of availableAssets) {
      const assetIdStr = asset._id ? asset._id.toString() : "";

      if (usedAssetIds.has(assetIdStr)) {
        continue;
      }

      if (!this.extractValidUrl(asset)) {
        continue;
      }

      let score = 0;
      let exactTagMatches = 0;

      const assetTags = (asset.tags || []).map((t) => String(t).toLowerCase().trim());
      const filename = (asset.originalFilename || "").toLowerCase();
      const altText = (asset.altText || asset.aiMetadata?.altText || "").toLowerCase();
      const description = (asset.description || asset.aiMetadata?.description || "").toLowerCase();

      // Factor 1: EXACT TAG MATCHING (Highest Weight: +50)
      queryKeywords.forEach((kw) => {
        if (assetTags.includes(kw)) {
          exactTagMatches++;
          score += 50;
        }
      });

      // Factor 2: FILENAME SUBSTRING MATCHING (+20)
      queryKeywords.forEach((kw) => {
        if (filename.includes(kw)) {
          score += 20;
        }
      });

      // Factor 3: ALT TEXT MATCHING (+15)
      queryKeywords.forEach((kw) => {
        if (altText.includes(kw)) {
          score += 15;
        }
      });

      // Factor 4: DESCRIPTION MATCHING (+10)
      queryKeywords.forEach((kw) => {
        if (description.includes(kw)) {
          score += 10;
        }
      });

      if (score >= minScoreThreshold) {
        candidates.push({ asset, score, exactTagMatches });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      if (b.exactTagMatches !== a.exactTagMatches) {
        return b.exactTagMatches - a.exactTagMatches;
      }
      return b.score - a.score;
    });

    return candidates[0];
  }

  /**
   * Safely extracts a verified URL from a MediaAsset document.
   */
  extractValidUrl(asset) {
    if (!asset) return null;

    const candidateUrls = [
      asset.urls?.webp,
      asset.urls?.original,
      asset.urls?.thumbnail_md,
      asset.url,
    ];

    for (const url of candidateUrls) {
      if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"))) {
        return url;
      }
    }

    return null;
  }
}

module.exports = new AssetResolverService();
