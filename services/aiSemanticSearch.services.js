const crypto = require("crypto");
const mongoose = require("mongoose");
const { Service } = require("../core");
const { MediaAsset } = require("../models");
const { externalMediaService } = require("../external-media");
const { providerRegistry } = require("../ai");

class AISemanticSearchService extends Service {
  /**
   * Expands the query using AI, searches local and external sources,
   * normalizes all records, and ranks them by the chosen sort strategy.
   */
  async search(userId, query, page = 1, limit = 20, sort = "-relevance") {
    if (!query || query.trim() === "") {
      return [];
    }

    const trimmedQuery = query.trim();

    // 1. Run AI Query Expansion using default registry model (Gemini)
    const expandedKeywords = await this.expandQuery(trimmedQuery);
    console.log(`[AISemanticSearch] Expanded keywords for "${trimmedQuery}":`, expandedKeywords);

    // 2. Fetch local and external results in parallel
    const localTask = this._searchLocal(userId, trimmedQuery, expandedKeywords);
    const externalTask = this._searchExternal(trimmedQuery, expandedKeywords, page, limit);

    const [localAssets, externalPhotos] = await Promise.all([localTask, externalTask]);

    const unifiedResults = [];
    const uniqueUrls = new Set();
    const localProviderAssetIds = new Set();

    // 3. Map Local Assets
    localAssets.forEach((asset) => {
      const regularUrl = asset.urls?.webp || asset.urls?.original || "";
      const previewUrl = asset.urls?.thumbnail_md || asset.urls?.thumbnail_sm || regularUrl;

      if (asset.providerAssetId) {
        localProviderAssetIds.add(`${asset.provider}_${asset.providerAssetId}`);
      }

      if (regularUrl) {
        uniqueUrls.add(this._normalizeUrl(regularUrl));
      }

      // Calculate semantic match score for ranking
      const score = this._calculateSemanticScore(asset, expandedKeywords);

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
        semanticScore: score + 100, // Boost local assets to rank first
        updatedAt: asset.updatedAt || asset.createdAt,
        createdAt: asset.createdAt,
        usageCount: asset.usageCount || 0,
      });
    });

    // 4. Map External Photos
    externalPhotos.forEach((photo) => {
      const extUniqueId = `${photo.provider}_${photo.id}`;

      // Exclude if already imported locally
      if (localProviderAssetIds.has(extUniqueId)) {
        return;
      }

      const normalizedUrl = this._normalizeUrl(photo.url);
      const normalizedDownload = this._normalizeUrl(photo.downloadUrl);

      // Exclude duplicates
      if (uniqueUrls.has(normalizedUrl) || uniqueUrls.has(normalizedDownload)) {
        return;
      }

      uniqueUrls.add(normalizedUrl);

      // Compute semantic relevance score locally using expanded keywords
      const score = this._calculateSemanticScore(photo, expandedKeywords);

      unifiedResults.push({
        id: `${photo.provider}_${photo.id}`,
        url: photo.url,
        previewUrl: photo.previewUrl,
        alt: photo.alt || "External Photo",
        description: photo.description || "",
        tags: photo.tags || [],
        dimensions: {
          width: photo.width || 0,
          height: photo.height || 0,
        },
        author: photo.author,
        semanticScore: score,
        updatedAt: null,
        createdAt: null,
        usageCount: 0,
      });
    });

    // 5. Rank and Sort unified results
    if (sort === "recentlyUsed" || sort === "-recentlyUsed") {
      unifiedResults.sort((a, b) => {
        const isLocalA = a.id.startsWith("local_");
        const isLocalB = b.id.startsWith("local_");
        if (isLocalA && !isLocalB) return -1;
        if (!isLocalA && isLocalB) return 1;
        if (isLocalA && isLocalB) {
          const dateA = new Date(a.updatedAt || 0).getTime();
          const dateB = new Date(b.updatedAt || 0).getTime();
          return dateB - dateA;
        }
        return b.semanticScore - a.semanticScore;
      });
    } else if (sort === "usageCount" || sort === "-usageCount") {
      unifiedResults.sort((a, b) => {
        const isLocalA = a.id.startsWith("local_");
        const isLocalB = b.id.startsWith("local_");
        if (isLocalA && !isLocalB) return -1;
        if (!isLocalA && isLocalB) return 1;
        if (isLocalA && isLocalB) {
          return b.usageCount - a.usageCount;
        }
        return b.semanticScore - a.semanticScore;
      });
    } else {
      // Default: relevance ranking
      unifiedResults.sort((a, b) => b.semanticScore - a.semanticScore);
    }

    // Clean up temporary sorting helpers before returning
    return unifiedResults.slice(0, limit).map(({ semanticScore, updatedAt, createdAt, usageCount, ...item }) => item);
  }

  /**
   * Uses Gemini to expand the search query into a list of related semantic terms
   */
  async expandQuery(query) {
    try {
      const provider = providerRegistry.getDefault();
      
      const prompt = `You are a search query expansion assistant. Your goal is to take a raw search query for an image library and expand it into a list of semantic keywords, synonyms, concepts, and related tags.
      
Rules:
- Output ONLY a JSON array of strings representing the expanded terms (including the original query terms).
- Keep the expanded list highly relevant and under 10 terms.
- Do not include any explanations, introduction, or markdown wrapping. Output only the raw valid JSON array.

Input Query: "${query}"`;

      const response = await provider.generate([
        { role: "user", content: prompt }
      ], {
        temperature: 0.1,
      });

      const cleanedText = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanedText);
      if (Array.isArray(parsed)) {
        return parsed.map(term => term.trim().toLowerCase());
      }
    } catch (err) {
      console.warn("[AISemanticSearch] Failed to expand query with AI, falling back to basic tokenization:", err.message);
    }

    // Fallback: tokenize query by words
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  /**
   * Search local database with full text search index + comprehensive $or matching on OCR/AI metadata fields
   */
  async _searchLocal(userId, originalQuery, keywords) {
    try {
      const searchString = [originalQuery, ...keywords].join(" ");
      return await MediaAsset.find({
        user: userId,
        del_flag: 0,
        $or: [
          { $text: { $search: searchString } },
          { originalFilename: { $regex: originalQuery, $options: "i" } },
          { altText: { $regex: originalQuery, $options: "i" } },
          { description: { $regex: originalQuery, $options: "i" } },
          { ocrText: { $regex: originalQuery, $options: "i" } },
          { provider: { $regex: originalQuery, $options: "i" } },
          { tags: { $in: keywords } },
          { "aiMetadata.altText": { $regex: originalQuery, $options: "i" } },
          { "aiMetadata.description": { $regex: originalQuery, $options: "i" } },
          { "aiMetadata.tags": { $in: keywords } },
        ],
      }).limit(50).lean();
    } catch (err) {
      console.warn("[AISemanticSearch] Local search error:", err.message);
      return [];
    }
  }

  /**
   * Search external providers in parallel using original query first
   */
  async _searchExternal(originalQuery, keywords, page, limit) {
    try {
      const result = await externalMediaService.search(originalQuery, undefined, page, limit * 2);
      return result.photos;
    } catch (err) {
      console.error("[AISemanticSearch] External search failed:", err.message);
      return [];
    }
  }

  /**
   * Computes a relevance score based on keyword match density across all fields
   */
  _calculateSemanticScore(item, keywords) {
    let score = 0;
    
    // Normalize fields
    const altText = (item.altText || item.alt || "").toLowerCase();
    const description = (item.description || "").toLowerCase();
    const filename = (item.originalFilename || "").toLowerCase();
    const ocr = (item.ocrText || "").toLowerCase();
    const provider = (item.provider || "").toLowerCase();
    const tags = (item.tags || []).map(t => String(t).toLowerCase());
    
    const aiAlt = (item.aiMetadata?.altText || "").toLowerCase();
    const aiDesc = (item.aiMetadata?.description || "").toLowerCase();
    const aiTags = (item.aiMetadata?.tags || []).map(t => String(t).toLowerCase());

    keywords.forEach((keyword) => {
      const kw = keyword.toLowerCase();
      const escapedKw = this._escapeRegExp(kw);
      const regex = new RegExp(`\\b${escapedKw}\\b`, "gi");

      const matchCount = (text) => {
        if (!text) return 0;
        const matches = text.match(regex);
        return matches ? matches.length : (text.includes(kw) ? 0.5 : 0);
      };

      // AltText / Title matches (Weight 10)
      score += matchCount(altText) * 10.0;
      score += matchCount(aiAlt) * 8.0;

      // Tags matches (Weight 8)
      if (tags.includes(kw)) score += 8.0;
      if (aiTags.includes(kw)) score += 6.0;

      // OCR Text matches (Weight 6)
      score += matchCount(ocr) * 6.0;

      // Filename matches (Weight 5)
      score += matchCount(filename) * 5.0;

      // Description matches (Weight 3)
      score += matchCount(description) * 3.0;
      score += matchCount(aiDesc) * 2.0;

      // Provider matches (Weight 2)
      if (provider === kw || provider.includes(kw)) score += 2.0;
    });

    return score;
  }

  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _normalizeUrl(urlStr) {
    if (!urlStr) return "";
    try {
      const url = new URL(urlStr);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return urlStr.toLowerCase();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FUTURE EMBEDDING SEARCH INTEGRATION PREPARATION
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Placeholder for future vector similarity search pipeline.
   * Steps:
   * 1. Call Gemini text embedding model (e.g. text-embedding-004):
   *    const response = await googleAI.embedText({ text: query });
   *    const vector = response.embedding.values;
   * 
   * 2. Query vector DB (MongoDB Atlas Vector Search or Pinecone):
   *    const results = await MediaAsset.aggregate([
   *      {
   *        $vectorSearch: {
   *          index: "vector_index",
   *          path: "embedding",
   *          queryVector: vector,
   *          numCandidates: 100,
   *          limit: limit
   *        }
   *      }
   *    ]);
   */
  async vectorSearch(userId, query, limit = 20) {
    console.log("[AISemanticSearch] Vector Search stub query:", query);
    return [];
  }
}

module.exports = new AISemanticSearchService();
