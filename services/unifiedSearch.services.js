const { Service } = require("../core");
const { MediaAsset } = require("../models");
const { externalMediaService } = require("../external-media");

class UnifiedSearchService extends Service {
  /**
   * Performs a unified search across local library and external providers.
   * Maps all results to a single format, ranks local assets first, and deduplicates matches.
   */
  async search(userId, query, page = 1, limit = 20) {
    if (!query || query.trim() === "") {
      return [];
    }

    const trimmedQuery = query.trim();

    // 1. Fetch Local Assets in parallel with external search
    const localTask = this._searchLocal(userId, trimmedQuery);
    const externalTask = externalMediaService.search(trimmedQuery, undefined, page, limit);

    const [localAssets, externalResponse] = await Promise.all([localTask, externalTask]);

    const unifiedResults = [];
    const localProviderAssetIds = new Set();
    const uniqueUrls = new Set();

    // 2. Map and add Local Assets (Ranked first)
    localAssets.forEach((asset) => {
      const regularUrl = asset.urls?.webp || asset.urls?.original || "";
      const previewUrl = asset.urls?.thumbnail_md || asset.urls?.thumbnail_sm || regularUrl;

      // Track imported external IDs to filter out duplicate external results
      if (asset.providerAssetId) {
        localProviderAssetIds.add(`${asset.provider}_${asset.providerAssetId}`);
      }

      if (regularUrl) {
        uniqueUrls.add(this._normalizeUrl(regularUrl));
      }

      unifiedResults.push({
        id: `local_${asset._id}`,
        url: regularUrl,
        previewUrl,
        alt: asset.altText || asset.originalFilename || "Local Media",
        description: asset.description || "",
        tags: asset.tags || [],
        dimensions: {
          width: asset.dimensions?.width || 0,
          height: asset.dimensions?.height || 0,
        },
        author: {
          name: "Me (Local Library)",
        },
      });
    });

    // 3. Map and merge External Photos
    externalResponse.photos.forEach((photo) => {
      const extUniqueId = `${photo.provider}_${photo.id}`;

      // Skip if this image has already been imported locally
      if (localProviderAssetIds.has(extUniqueId)) {
        return;
      }

      const normalizedUrl = this._normalizeUrl(photo.url);
      const normalizedDownload = this._normalizeUrl(photo.downloadUrl);

      // Skip duplicates based on URL matches
      if (uniqueUrls.has(normalizedUrl) || uniqueUrls.has(normalizedDownload)) {
        return;
      }

      uniqueUrls.add(normalizedUrl);

      unifiedResults.push({
        id: `${photo.provider}_${photo.id}`, // Hide direct provider keys under prefixed unified IDs
        url: photo.url,
        previewUrl: photo.previewUrl,
        alt: photo.alt,
        description: photo.description,
        tags: photo.tags,
        dimensions: {
          width: photo.width,
          height: photo.height,
        },
        author: photo.author,
      });
    });

    // Return the ranked, deduplicated unified array
    return unifiedResults.slice(0, limit);
  }

  /**
   * Searches local database assets using text search weighting
   */
  async _searchLocal(userId, query) {
    try {
      return await MediaAsset.find(
        {
          user: userId,
          del_flag: 0,
          $or: [
            { $text: { $search: query } },
            { tags: { $in: [query.toLowerCase()] } },
          ],
        },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(15)
        .lean();
    } catch (err) {
      // Fallback if full-text index is not fully warmed up or throws errors
      console.warn("[UnifiedSearch] Local text search fallback triggered:", err.message);
      return await MediaAsset.find({
        user: userId,
        del_flag: 0,
        $or: [
          { originalFilename: new RegExp(query, "i") },
          { tags: new RegExp(query, "i") },
        ],
      })
        .limit(15)
        .lean();
    }
  }

  /**
   * Helper to normalize URLs for deduplication checks
   */
  _normalizeUrl(urlStr) {
    if (!urlStr) return "";
    try {
      const url = new URL(urlStr);
      // Remove protocol and query query strings for comparison accuracy
      return `${url.hostname}${url.pathname}`;
    } catch {
      return urlStr.toLowerCase();
    }
  }
}

module.exports = new UnifiedSearchService();
